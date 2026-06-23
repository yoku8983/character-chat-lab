import Database from "better-sqlite3";
import { Memory } from "./types";

interface MemoryRow {
  id: number;
  persona_id: string;
  content: string;
  importance: number;
  source_session_id: string | null;
  created_at: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    personaId: row.persona_id,
    content: row.content,
    importance: row.importance,
    sourceSessionId: row.source_session_id ?? undefined,
    createdAt: row.created_at,
  };
}

export function listMemories(db: Database.Database, personaId: string): Memory[] {
  const rows = db
    .prepare(
      "SELECT * FROM memories WHERE persona_id = ? ORDER BY importance DESC, created_at DESC"
    )
    .all(personaId) as MemoryRow[];
  return rows.map(rowToMemory);
}

export function getTopMemories(db: Database.Database, personaId: string, limit: number): Memory[] {
  const rows = db
    .prepare(
      "SELECT * FROM memories WHERE persona_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?"
    )
    .all(personaId, limit) as MemoryRow[];
  return rows.map(rowToMemory);
}

export function addMemory(
  db: Database.Database,
  personaId: string,
  content: string,
  importance: number,
  sourceSessionId?: string
): Memory {
  const result = db
    .prepare(
      `INSERT INTO memories (persona_id, content, importance, source_session_id, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .run(personaId, content, importance, sourceSessionId ?? null);
  const row = db
    .prepare("SELECT * FROM memories WHERE id = ?")
    .get(result.lastInsertRowid) as MemoryRow;
  return rowToMemory(row);
}

export function updateMemory(
  db: Database.Database,
  id: number,
  content: string,
  importance: number
): void {
  db.prepare("UPDATE memories SET content = ?, importance = ? WHERE id = ?").run(
    content,
    importance,
    id
  );
}

export function deleteMemory(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM memories WHERE id = ?").run(id);
}
