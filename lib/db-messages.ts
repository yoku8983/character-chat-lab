import Database from "better-sqlite3";
import { ChatMessage } from "./types";

interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function getMessages(db: Database.Database, sessionId: string): ChatMessage[] {
  const rows = db
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as MessageRow[];
  return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export function addMessage(
  db: Database.Database,
  sessionId: string,
  role: string,
  content: string
): void {
  db.prepare(
    `INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(sessionId, role, content);
  db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sessionId);
}

export function autoTitle(db: Database.Database, sessionId: string, firstMessage: string): void {
  const session = db.prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as
    | { title: string }
    | undefined;
  if (session && !session.title) {
    const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + "…" : firstMessage;
    db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
  }
}
