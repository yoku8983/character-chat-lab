import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { listSessions, createSession } from "@/lib/db-sessions";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const personaId = request.nextUrl.searchParams.get("personaId");
  const client = await ensureDb();
  const sessions = await listSessions(client, personaId ?? undefined);
  return Response.json(sessions);
}

export async function POST(request: NextRequest) {
  const { personaId, modelId } = (await request.json()) as {
    personaId: string;
    modelId: string;
  };
  if (!personaId || !modelId) {
    return Response.json({ error: "personaId and modelId are required" }, { status: 400 });
  }
  const client = await ensureDb();
  const id = crypto.randomUUID();
  const session = await createSession(client, id, personaId, modelId);
  return Response.json(session, { status: 201 });
}
