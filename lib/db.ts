import { createClient, Client } from "@libsql/client";
import path from "path";
import fs from "fs";
import { syncYamlPersonas } from "./db-personas";

const globalForDb = globalThis as unknown as {
  __dbClient?: Client;
  __dbInitPromise?: Promise<void>;
};

let client: Client | null = globalForDb.__dbClient ?? null;
let initPromise: Promise<void> | null = globalForDb.__dbInitPromise ?? null;

function getClient(): Client {
  if (client) return client;

  const url =
    process.env.LIBSQL_URL ||
    `file:${path.join(process.cwd(), "data", "chat-lab.db")}`;

  if (url.startsWith("file:")) {
    const filePath = url.slice(5);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  client = createClient({
    url,
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });
  globalForDb.__dbClient = client;

  return client;
}

export async function ensureDb(): Promise<Client> {
  const c = getClient();
  if (!initPromise) {
    initPromise = (async () => {
      await initSchema(c);
      await syncYamlPersonas(c);
    })();
    globalForDb.__dbInitPromise = initPromise;
  }
  await initPromise;
  return c;
}

async function initSchema(c: Client): Promise<void> {
  await c.batch([
    `CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      definition TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'db',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_persona ON sessions(persona_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
    `CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5,
      source_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_memories_persona ON memories(persona_id)`,
    `CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(persona_id, importance DESC)`,
    `CREATE TABLE IF NOT EXISTS seeded_personas (
      id TEXT PRIMARY KEY,
      seeded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL,
      session_id TEXT,
      persona_id TEXT,
      model_id TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_usage_log_created ON usage_log(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_usage_log_model ON usage_log(model_id)`,
  ]);

  try {
    await c.execute("ALTER TABLE personas ADD COLUMN profile_image TEXT");
  } catch {
    // カラム既存時は無視
  }
}
