import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
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
  const db = getDb();
  updateMemory(db, parseInt(id), content, importance);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  deleteMemory(db, parseInt(id));
  return Response.json({ ok: true });
}
