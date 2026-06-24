import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { getSession, updateSessionTitle, deleteSession } from "@/lib/db-sessions";
import { getMessages } from "@/lib/db-messages";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  const session = await getSession(client, id);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  const messages = await getMessages(client, id);
  return Response.json({ session, messages });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { title } = (await request.json()) as { title: string };
  const client = await ensureDb();
  await updateSessionTitle(client, id, title);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  await deleteSession(client, id);
  return Response.json({ ok: true });
}
