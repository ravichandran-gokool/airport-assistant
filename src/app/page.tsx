"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Escalation {
  reason: string;
  summary: string;
}

const SUGGESTIONS = [
  "What's the status of flight SQ318?",
  "How do I get to the city centre?",
  "Where can I find a nursing room?",
  "我可以带多少液体上飞机？",
];

const GREETING =
  "Hi! I'm the Meridian Airport assistant. Ask me about flights, directions, transport, or airport services — in any language.";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, escalation]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The greeting is UI-only; the model gets the real conversation.
        body: JSON.stringify({ messages: nextMessages.slice(1) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Something went wrong." }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
        if (data.escalation) setEscalation(data.escalation);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Network error — please check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Deterministic escalation path: this button never goes through the AI.
  function requestHuman() {
    if (escalation) return;
    setEscalation({
      reason: "Passenger tapped “Talk to a human”.",
      summary:
        messages.filter((m) => m.role === "user").slice(-1)[0]?.content ??
        "No messages yet — passenger requested an agent directly.",
    });
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Meridian Regional Airport</h1>
          <p className="text-xs text-slate-500">AI Passenger Assistant · prototype</p>
        </div>
        <button
          onClick={requestHuman}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Talk to a human
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white max-w-[85%] whitespace-pre-wrap"
                : "self-start rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm max-w-[85%] whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="self-start rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
            </span>
          </div>
        )}

        {escalation && (
          <div className="self-stretch rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Connecting you to a human agent…</p>
            <p className="mt-1">
              A service agent has been notified and will join this chat. Summary passed to the agent:
            </p>
            <p className="mt-1 italic">“{escalation.summary}”</p>
            <p className="mt-2 text-xs text-amber-700">
              Prototype note: in production this hands over to the live agent console.
            </p>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3">
        <form
          className="mx-auto flex w-full max-w-2xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask in any language…"
            className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <p className="mx-auto mt-1.5 w-full max-w-2xl text-center text-[11px] text-slate-400">
          Prototype — flight data is simulated. Answers come from the airport knowledge base.
        </p>
      </footer>
    </div>
  );
}
