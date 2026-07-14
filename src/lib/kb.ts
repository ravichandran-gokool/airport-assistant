import fs from "fs";
import path from "path";
import type OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

interface Chunk {
  source: string;
  heading: string;
  text: string;
  embedding: number[];
}

// Embeddings are computed once per server instance and cached in memory.
// Fine for a ~25-chunk prototype; a production system would precompute
// and store these in a vector database.
let chunksPromise: Promise<Chunk[]> | null = null;

function loadRawChunks(): Omit<Chunk, "embedding">[] {
  const dir = path.join(process.cwd(), "data", "knowledge");
  const chunks: Omit<Chunk, "embedding">[] = [];

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    // Each "## heading" section becomes one retrievable chunk.
    const sections = body.split(/^## /m).slice(1);
    for (const section of sections) {
      const [heading, ...rest] = section.split("\n");
      const text = rest.join("\n").trim();
      if (text) chunks.push({ source: file, heading: heading.trim(), text });
    }
  }
  return chunks;
}

async function ensureIndex(client: OpenAI): Promise<Chunk[]> {
  if (!chunksPromise) {
    chunksPromise = (async () => {
      const raw = loadRawChunks();
      const res = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: raw.map((c) => `${c.heading}\n${c.text}`),
      });
      return raw.map((c, i) => ({ ...c, embedding: res.data[i].embedding }));
    })().catch((err) => {
      chunksPromise = null; // allow retry on next request
      throw err;
    });
  }
  return chunksPromise;
}

// OpenAI embeddings are unit-length, so dot product == cosine similarity.
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export async function searchKb(client: OpenAI, query: string, k = 4) {
  const chunks = await ensureIndex(client);
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  const queryEmbedding = res.data[0].embedding;

  return chunks
    .map((c) => ({ heading: c.heading, text: c.text, score: dot(queryEmbedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
