import { Client, Row } from "@libsql/client";

export interface UsageLogEntry {
  route: "chat" | "convert" | "extract";
  sessionId?: string | null;
  personaId?: string | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost?: number | null;
}

export interface ParsedUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost: number | null;
}

export interface UsageByModel {
  modelId: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost: number;
  cacheHitRate: number;
}

export interface UsageByDay {
  day: string;
  cost: number;
  calls: number;
}

export interface UsageOverall {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost: number;
  cacheHitRate: number;
}

export interface UsageSummary {
  byModel: UsageByModel[];
  byDay: UsageByDay[];
  overall: UsageOverall;
}

export async function recordUsage(client: Client, entry: UsageLogEntry): Promise<void> {
  await client.execute({
    sql: `INSERT INTO usage_log (route, session_id, persona_id, model_id, prompt_tokens, completion_tokens, cached_tokens, cost, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      entry.route,
      entry.sessionId ?? null,
      entry.personaId ?? null,
      entry.modelId,
      entry.promptTokens,
      entry.completionTokens,
      entry.cachedTokens,
      entry.cost ?? null,
    ],
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usageFromOpenRouter(usage: any): ParsedUsage | null {
  if (!usage) return null;
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const cachedTokens = Number(usage.prompt_tokens_details?.cached_tokens) || 0;
  const cost = typeof usage.cost === "number" ? usage.cost : null;
  return { promptTokens, completionTokens, cachedTokens, cost };
}

function rowToUsageByModel(row: Row): UsageByModel {
  const promptTokens = Number(row.prompt_tokens) || 0;
  const cachedTokens = Number(row.cached_tokens) || 0;
  return {
    modelId: row.model_id as string,
    calls: Number(row.calls) || 0,
    promptTokens,
    completionTokens: Number(row.completion_tokens) || 0,
    cachedTokens,
    cost: Number(row.cost) || 0,
    cacheHitRate: promptTokens > 0 ? cachedTokens / promptTokens : 0,
  };
}

function rowToUsageByDay(row: Row): UsageByDay {
  return {
    day: row.day as string,
    cost: Number(row.cost) || 0,
    calls: Number(row.calls) || 0,
  };
}

export async function getUsageSummary(client: Client): Promise<UsageSummary> {
  const byModelResult = await client.execute(
    `SELECT model_id, COUNT(*) AS calls, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost
     FROM usage_log GROUP BY model_id ORDER BY cost DESC`
  );
  const byModel = byModelResult.rows.map(rowToUsageByModel);

  const byDayResult = await client.execute(
    `SELECT date(created_at) AS day, SUM(cost) AS cost, COUNT(*) AS calls
     FROM usage_log GROUP BY day ORDER BY day DESC`
  );
  const byDay = byDayResult.rows.map(rowToUsageByDay);

  const overallResult = await client.execute(
    `SELECT COUNT(*) AS calls, SUM(prompt_tokens) AS prompt_tokens, SUM(completion_tokens) AS completion_tokens, SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost
     FROM usage_log`
  );
  const overallRow = overallResult.rows[0];
  const overallPromptTokens = Number(overallRow?.prompt_tokens) || 0;
  const overallCachedTokens = Number(overallRow?.cached_tokens) || 0;
  const overall: UsageOverall = {
    calls: Number(overallRow?.calls) || 0,
    promptTokens: overallPromptTokens,
    completionTokens: Number(overallRow?.completion_tokens) || 0,
    cachedTokens: overallCachedTokens,
    cost: Number(overallRow?.cost) || 0,
    cacheHitRate: overallPromptTokens > 0 ? overallCachedTokens / overallPromptTokens : 0,
  };

  return { byModel, byDay, overall };
}
