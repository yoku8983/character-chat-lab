import Database from "better-sqlite3";
import { Session } from "./types";

interface SessionRow {
  id: string;
  persona_id: string;
  model_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    personaId: row.persona_id,
    modelId: row.model_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
  };
}

export function listSessions(db: Database.Database, personaId?: string): Session[] {
  const query = personaId
    ? `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s WHERE s.persona_id = ? ORDER BY s.updated_at DESC`
    : `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s ORDER BY s.updated_at DESC`;
  const rows = personaId
    ? (db.prepare(query).all(personaId) as SessionRow[])
    : (db.prepare(query).all() as SessionRow[]);
  return rows.map(rowToSession);
}

export function getSession(db: Database.Database, id: string): Session | undefined {
  const row = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
       FROM sessions s WHERE s.id = ?`
    )
    .get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function createSession(
  db: Database.Database,
  id: string,
  personaId: string,
  modelId: string
): Session {
  db.prepare(
    `INSERT INTO sessions (id, persona_id, model_id, title, created_at, updated_at)
     VALUES (?, ?, ?, '', datetime('now'), datetime('now'))`
  ).run(id, personaId, modelId);
  return getSession(db, id)!;
}

export function updateSessionTitle(db: Database.Database, id: string, title: string): void {
  db.prepare("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
    title,
    id
  );
}

export function deleteSession(db: Database.Database, id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}
