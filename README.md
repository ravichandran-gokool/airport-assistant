# Meridian Airport AI Passenger Assistant

An AI-powered passenger assistant prototype built for the Hipster Technical Project Intern assessment. Passengers chat with the assistant (in any language) to get flight information, directions, transport options, and airport services — with a human-escalation path when the AI can't help.

**Live demo:** https://airport-assistant-d4zf.vercel.app

## Setup

Requires Node.js 18+ and an OpenAI API key.

```bash
git clone https://github.com/ravichandran-gokool/airport-assistant.git
cd airport-assistant
npm install
cp .env.example .env.local   # then put your OpenAI API key in .env.local
npm run dev                  # open http://localhost:3000
```

## Technical approach

The core of the app is a **tool-calling loop** ([src/app/api/chat/route.ts](src/app/api/chat/route.ts)). The LLM never accesses data directly — it requests one of three tools, the server executes the real function and feeds the result back, and the loop repeats until the model answers in plain text (capped at 4 rounds):

| Tool | What it does |
|------|--------------|
| `search_flights` | Looks up mock flight data ([data/flights.json](data/flights.json)) by flight number / city — stands in for a real FIDS API integration |
| `search_knowledge_base` | RAG-lite semantic search over airport documents |
| `escalate_to_agent` | Flags the conversation for human handover (AI-initiated path) |

**RAG-lite retrieval** ([src/lib/kb.ts](src/lib/kb.ts)): the airport knowledge base is 5 markdown documents ([data/knowledge/](data/knowledge/)), chunked by `##` heading so each chunk covers one topic. Chunks are embedded with `text-embedding-3-small` (computed once per server instance and cached in memory). A passenger query is embedded in the same space and the top-4 chunks by cosine similarity are returned to the model, which answers only from that retrieved text — this grounding is what prevents hallucinated gates, prices, and locations.

**Escalation is deliberately hybrid.** The AI can decide to escalate (urgent/sensitive situations, unanswerable questions), but the UI also has a persistent "Talk to a human" button that bypasses the AI entirely — a passenger's exit from the system never depends on the model making the right call.

**Multilingual support** comes free from the LLM: the system prompt instructs it to reply in the passenger's language, so no translation layer is needed.

## Key technical decisions

**Tool calling over a free-form LLM.** The model never answers from its own memory about this airport — it can only request one of three typed tools, and the server executes the real function and returns the result. This keeps the non-deterministic part (the model) separated from the deterministic part (data lookups), makes every answer traceable to a data source, and means swapping the mock flight JSON for a real FIDS API changes one function, not the AI design.

**RAG instead of stuffing documents into the prompt (or fine-tuning).** Sending the entire knowledge base with every request wastes tokens and degrades focus; fine-tuning bakes facts into the model where they can't be updated. Retrieval keeps airport content in editable markdown files — operations staff could update "the pharmacy moved" and the assistant reflects it immediately — and only the 4 most relevant chunks reach the model per question.

**Chunking by `##` heading.** Each markdown section covers exactly one topic (smoking area, taxi stand, liquids rule), so the heading is a natural retrieval boundary. Embedding whole files would dilute matches; arbitrary fixed-size chunks would split topics mid-sentence. Trade-off: answers spanning two sections retrieve both only if each independently matches the query.

**Embeddings over keyword search.** "Where can I charge my phone?" contains no word from the "power sockets at gate seating" section — semantic similarity matches meaning, not vocabulary. This matters even more for multilingual queries, since embeddings of a Chinese question land near the English document that answers it.

**Cosine similarity via plain dot product.** OpenAI embeddings are unit-normalized, so the cosine denominator is always 1 — the dot product alone is the similarity score. (This shortcut is only valid because of that normalization.)

**Hybrid escalation, not AI-only.** The model can call `escalate_to_agent` when it detects urgency or its own failure, but the UI's "Talk to a human" button bypasses the AI entirely. A passenger's exit from the system should never depend on a non-deterministic component making the right call.

**`temperature: 0.2`.** An airport assistant needs consistent, factual answers, not creative ones. Low temperature also makes tool routing more deterministic.

**A hard cap of 4 tool rounds per request.** Each model→tool→model round costs latency and money; the cap guarantees a confused model degrades into a polite failure message instead of an infinite loop.

**Deliberate prototype simplifications** (what I'd change for production): responses are not streamed (the UI shows typing dots instead — streaming would improve perceived latency); the embedding index lives in server memory and is rebuilt on each cold start (a vector database like pgvector would persist it); and there's no retrieval score threshold, so a weak top match still reaches the model rather than short-circuiting to "I don't know".

## AI models used

- `gpt-4o-mini` (chat + tool calling) — chosen for low latency and cost at prototype scale
- `text-embedding-3-small` (knowledge-base and query embeddings)

## What's mocked (prototype honesty)

- **Flight data** is a static JSON file, not a live FIDS feed — the tool interface is the same shape a real integration would use.
- **Human escalation** shows a handover card with a conversation summary; in production this would push to a live agent console (e.g. Voncierge-style video assistance).
- **The airport is fictional** ("Meridian Regional Airport") — all knowledge-base facts are sample content.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · OpenAI SDK · deployed on Vercel
