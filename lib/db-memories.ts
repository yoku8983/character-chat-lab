import { Client, Row } from "@libsql/client";
import { Memory } from "./types";

function rowToMemory(row: Row): Memory {
  return {
    id: row.id as number,
    personaId: row.persona_id as string,
    content: row.content as string,
    importance: row.importance as number,
    sourceSessionId: (row.source_session_id as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function listMemories(client: Client, personaId: string): Promise<Memory[]> {
  const result = await client.execute({
    sql: "SELECT * FROM memories WHERE persona_id = ? ORDER BY importance DESC, created_at DESC",
    args: [personaId],
  });
  return result.rows.map(rowToMemory);
}

export async function getTopMemories(client: Client, personaId: string, limit: number): Promise<Memory[]> {
  const result = await client.execute({
    sql: "SELECT * FROM memories WHERE persona_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?",
    args: [personaId, limit],
  });
  return result.rows.map(rowToMemory);
}

export async function addMemory(
  client: Client,
  personaId: string,
  content: string,
  importance: number,
  sourceSessionId?: string
): Promise<Memory> {
  const insertResult = await client.execute({
    sql: `INSERT INTO memories (persona_id, content, importance, source_session_id, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [personaId, content, importance, sourceSessionId ?? null],
  });
  const result = await client.execute({
    sql: "SELECT * FROM memories WHERE id = ?",
    args: [insertResult.lastInsertRowid!],
  });
  return rowToMemory(result.rows[0]);
}

export async function updateMemory(
  client: Client,
  id: number,
  content: string,
  importance: number
): Promise<void> {
  await client.execute({
    sql: "UPDATE memories SET content = ?, importance = ? WHERE id = ?",
    args: [content, importance, id],
  });
}

export async function deleteMemory(client: Client, id: number): Promise<void> {
  await client.execute({
    sql: "DELETE FROM memories WHERE id = ?",
    args: [id],
  });
}
