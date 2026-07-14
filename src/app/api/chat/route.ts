import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { searchFlights, type FlightQuery } from "@/lib/flights";
import { searchKb } from "@/lib/kb";

export const maxDuration = 60;

const MODEL = "gpt-4o-mini";
// Cap on model→tool→model rounds per request, so a confused model can't loop forever.
const MAX_TOOL_ROUNDS = 4;

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description:
        "Look up live flight information (status, gate, scheduled time, baggage belt, check-in row) by flight number and/or destination city.",
      parameters: {
        type: "object",
        properties: {
          flightNo: {
            type: "string",
            description: "Flight number, e.g. SQ318",
          },
          city: { type: "string", description: "Origin or destination city" },
          type: { type: "string", enum: ["departure", "arrival"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description:
        "Search the airport knowledge base for facilities, wayfinding directions, ground transport, passenger services, and travel rules.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What the passenger wants to know",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_agent",
      description:
        "Hand the conversation over to a human service agent. Use when the passenger asks for a human, is in an urgent or sensitive situation, or the assistant cannot answer.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why escalation is needed" },
          summary: {
            type: "string",
            description: "One-line summary of the conversation for the agent",
          },
        },
        required: ["reason", "summary"],
      },
    },
  },
];

interface Escalation {
  reason: string;
  summary: string;
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.",
      },
      { status: 500 }
    );
  }

  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages array required" }, { status: 400 });
  }

  const client = new OpenAI();
  const convo: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.slice(-20), // keep the request bounded
  ];

  let escalation: Escalation | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: convo,
        tools,
        temperature: 0.2,
      });

      const msg = completion.choices[0].message;
      if (!msg.tool_calls?.length) {
        return Response.json({ reply: msg.content ?? "", escalation });
      }

      convo.push(msg);
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        const args = JSON.parse(call.function.arguments || "{}");
        let result: unknown;

        switch (call.function.name) {
          case "search_flights":
            result = searchFlights(args as FlightQuery);
            break;
          case "search_knowledge_base":
            result = await searchKb(client, args.query ?? "");
            break;
          case "escalate_to_agent":
            escalation = {
              reason: args.reason ?? "",
              summary: args.summary ?? "",
            };
            result = {
              status:
                "Ticket created. A human agent will join this chat shortly.",
            };
            break;
          default:
            result = { error: `Unknown tool: ${call.function.name}` };
        }

        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    return Response.json({
      reply:
        "Sorry, I had trouble with that request. Please try again, or tap “Talk to a human”.",
      escalation,
    });
  } catch (err) {
    console.error("chat route error:", err);
    return Response.json(
      { error: "The assistant is temporarily unavailable. Please try again." },
      { status: 502 }
    );
  }
}
