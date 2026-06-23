import { loadAllPersonas } from "@/lib/personas";

export async function GET() {
  const personas = loadAllPersonas();
  const summary = personas.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  return Response.json(summary);
}
