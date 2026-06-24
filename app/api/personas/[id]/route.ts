import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { getPersona, updatePersona, deletePersona } from "@/lib/db-personas";
import { Persona } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  const persona = await getPersona(client, id);
  if (!persona) {
    return Response.json({ error: "Persona not found" }, { status: 404 });
  }
  return Response.json(persona);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const persona = (await request.json()) as Persona;
  const client = await ensureDb();
  await updatePersona(client, id, persona);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  const deleted = await deletePersona(client, id);
  if (!deleted) {
    return Response.json({ error: "最後のペルソナは削除できません" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
