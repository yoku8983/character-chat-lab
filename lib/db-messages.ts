import { Client } from "@libsql/client";
import { ChatMessage } from "./types";

export async function getMessages(client: Client, sessionId: string): Promise<ChatMessage[]> {
  const result = await client.execute({
    sql: "SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC",
    args: [sessionId],
  });
  return result.rows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string,
  }));
}

export async function addMessage(
  client: Client,
  sessionId: string,
  role: string,
  content: string
): Promise<void> {
  await client.batch([
    {
      sql: `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime('now'))`,
      args: [sessionId, role, content],
    },
    {
      sql: "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?",
      args: [sessionId],
    },
  ]);
}

export async function autoTitle(client: Client, sessionId: string, firstMessage: string): Promise<void> {
  const result = await client.execute({
    sql: "SELECT title FROM sessions WHERE id = ?",
    args: [sessionId],
  });
  const session = result.rows[0];
  if (session && !session.title) {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + "…" : firstMessage;
    await client.execute({
      sql: "UPDATE sessions SET title = ? WHERE id = ?",
      args: [title, sessionId],
    });
  }
}
