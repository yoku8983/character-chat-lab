import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, updateSessionTitle, deleteSession } from "@/lib/db-sessions";
import { getMessages } from "@/lib/db-messages";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const session = getSession(db, id);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  const messages = getMessages(db, id);
  return Response.json({ session, messages });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = (await request.json()) as { title: string };
  const db = getDb();
  updateSessionTitle(db, id, title);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  deleteSession(db, id);
  return Response.json({ ok: true });
}
