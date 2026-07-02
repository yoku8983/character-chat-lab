import { ensureDb } from "@/lib/db";
import { getUsageSummary } from "@/lib/db-usage-log";

export async function GET() {
  const client = await ensureDb();
  const summary = await getUsageSummary(client);
  return Response.json(summary);
}
