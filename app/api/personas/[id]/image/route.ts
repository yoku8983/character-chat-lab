import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db";
import { getPersona, getPersonaImage, setPersonaImage, deletePersonaImage } from "@/lib/db-personas";
import { processProfileImage, ImageTooLargeError } from "@/lib/image-processing";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  const base64 = await getPersonaImage(client, id);
  if (!base64) {
    return new Response(null, { status: 404 });
  }
  const buffer = Buffer.from(base64, "base64");
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();

  const persona = await getPersona(client, id);
  if (!persona) {
    return Response.json({ error: "Persona not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File | null;
  if (!file) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      { error: "サポートされていない画像形式です（JPEG, PNG, WebP, GIF のみ）" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const base64WebP = await processProfileImage(buffer);
    await setPersonaImage(client, id, base64WebP);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ImageTooLargeError) {
      return Response.json({ error: "画像は10MB以下にしてください" }, { status: 413 });
    }
    return Response.json({ error: "画像の処理に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await ensureDb();
  await deletePersonaImage(client, id);
  return Response.json({ ok: true });
}
