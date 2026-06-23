import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { listSessions, createSession } from "@/lib/db-sessions";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const personaId = request.nextUrl.searchParams.get("personaId");
  const db = getDb();
  const sessions = listSessions(db, personaId ?? undefined);
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
  const db = getDb();
  const id = crypto.randomUUID();
  const session = createSession(db, id, personaId, modelId);
  return Response.json(session, { status: 201 });
}
