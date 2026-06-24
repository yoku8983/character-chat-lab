import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { updateMemory, deleteMemory } from "@/lib/db-memories";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content, importance } = (await request.json()) as {
    content: string;
    importance: number;
  };
  const client = await ensureDb();
  await updateMemory(client, parseInt(id), content, importance);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  await deleteMemory(client, parseInt(id));
  return Response.json({ ok: true });
}
