import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { addMessage, autoTitle } from "@/lib/db-messages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { role, content } = (await request.json()) as {
    role: string;
    content: string;
  };

  if (!role || !content) {
    return Response.json({ error: "role and content are required" }, { status: 400 });
  }

  const db = getDb();
  addMessage(db, id, role, content);

  if (role === "user") {
    autoTitle(db, id, content);
  }

  return Response.json({ ok: true }, { status: 201 });
}
