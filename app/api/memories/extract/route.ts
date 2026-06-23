import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { addMemory } from "@/lib/db-memories";
import { extractMemories } from "@/lib/memory-extraction";
import { ChatMessage } from "@/lib/types";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 500 });
  }

  const body = await request.json();
  const { personaId, modelId, messages, sessionId } = body as {
    personaId: string;
    modelId: string;
    messages: ChatMessage[];
    sessionId?: string;
  };

  if (!personaId || !modelId || !messages?.length) {
    return Response.json({ error: "personaId, modelId, and messages are required" }, { status: 400 });
  }

  const extracted = await extractMemories(messages, apiKey, modelId);

  if (extracted.length === 0) {
    return Response.json({ memories: [], message: "抽出可能な記憶はありませんでした" });
  }

  const db = getDb();
  const saved = extracted.map((m) =>
    addMemory(db, personaId, m.content, m.importance, sessionId)
  );

  return Response.json({ memories: saved });
}
