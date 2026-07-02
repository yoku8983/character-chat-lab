import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { addMemory, listMemories } from "@/lib/db-memories";
import { extractMemories } from "@/lib/memory-extraction";
import { recordUsage, usageFromOpenRouter } from "@/lib/db-usage-log";
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

  const client = await ensureDb();
  const existing = await listMemories(client, personaId);
  const { memories: extracted, usage } = await extractMemories(
    messages,
    apiKey,
    modelId,
    existing.map((m) => m.content)
  );

  try {
    const u = usageFromOpenRouter(usage);
    if (u) {
      await recordUsage(client, {
        route: "extract",
        sessionId: sessionId ?? null,
        personaId,
        modelId,
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        cachedTokens: u.cachedTokens,
        cost: u.cost,
      });
    }
  } catch (err) {
    console.error("Failed to record usage:", err);
  }

  if (extracted.length === 0) {
    return Response.json({ memories: [], message: "抽出可能な記憶はありませんでした" });
  }

  const seen = new Set(existing.map((m) => m.content.trim()));
  const saved = [];
  for (const m of extracted) {
    const key = m.content.trim();
    if (seen.has(key)) continue; // 既存 or バッチ内重複はスキップ
    seen.add(key);
    saved.push(await addMemory(client, personaId, m.content, m.importance, sessionId));
  }

  return Response.json({ memories: saved });
}
