import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { listMemories, addMemory } from "@/lib/db-memories";

export async function GET(request: NextRequest) {
  const personaId = request.nextUrl.searchParams.get("personaId");
  if (!personaId) {
    return Response.json({ error: "personaId is required" }, { status: 400 });
  }
  const client = await ensureDb();
  const memories = await listMemories(client, personaId);
  return Response.json(memories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { personaId, content, importance, sourceSessionId } = body as {
    personaId: string;
    content: string;
    importance?: number;
    sourceSessionId?: string;
  };

  if (!personaId || !content) {
    return Response.json({ error: "personaId and content are required" }, { status: 400 });
  }

  const client = await ensureDb();
  const memory = await addMemory(client, personaId, content, importance ?? 5, sourceSessionId);
  return Response.json(memory, { status: 201 });
}
