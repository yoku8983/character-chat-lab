import { ensureDb } from "@/lib/db";
import { listPersonas, createPersona } from "@/lib/db-personas";
import { NextRequest } from "next/server";
import { Persona } from "@/lib/types";

export async function GET() {
  const client = await ensureDb();
  const personas = await listPersonas(client);
  return Response.json(personas, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

export async function POST(request: NextRequest) {
  const persona = (await request.json()) as Persona;

  if (!persona.id || !persona.name) {
    return Response.json({ error: "id and name are required" }, { status: 400 });
  }

  const client = await ensureDb();
  try {
    await createPersona(client, persona);
    return Response.json({ id: persona.id }, { status: 201 });
  } catch {
    return Response.json({ error: "Persona already exists" }, { status: 409 });
  }
}
