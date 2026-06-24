import { Client, Row } from "@libsql/client";
import { Session } from "./types";

function rowToSession(row: Row): Session {
  return {
    id: row.id as string,
    personaId: row.persona_id as string,
    modelId: row.model_id as string,
    title: row.title as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    messageCount: row.message_count as number | undefined,
  };
}

export async function listSessions(client: Client, personaId?: string): Promise<Session[]> {
  const query = personaId
    ? `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s WHERE s.persona_id = ? ORDER BY s.updated_at DESC`
    : `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s ORDER BY s.updated_at DESC`;
  const result = personaId
    ? await client.execute({ sql: query, args: [personaId] })
    : await client.execute(query);
  return result.rows.map(rowToSession);
}

export async function getSession(client: Client, id: string): Promise<Session | undefined> {
  const result = await client.execute({
    sql: `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
         FROM sessions s WHERE s.id = ?`,
    args: [id],
  });
  return result.rows[0] ? rowToSession(result.rows[0]) : undefined;
}

export async function createSession(
  client: Client,
  id: string,
  personaId: string,
  modelId: string
): Promise<Session> {
  await client.execute({
    sql: `INSERT INTO sessions (id, persona_id, model_id, title, created_at, updated_at)
         VALUES (?, ?, ?, '', datetime('now'), datetime('now'))`,
    args: [id, personaId, modelId],
  });
  return (await getSession(client, id))!;
}

export async function updateSessionTitle(client: Client, id: string, title: string): Promise<void> {
  await client.execute({
    sql: "UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?",
    args: [title, id],
  });
}

export async function deleteSession(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: "DELETE FROM sessions WHERE id = ?",
    args: [id],
  });
}
