import { Client, Row } from "@libsql/client";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona } from "./types";

const PERSONAS_DIR = path.join(process.cwd(), "personas");

export async function syncYamlPersonas(client: Client): Promise<void> {
  if (!fs.existsSync(PERSONAS_DIR)) return;

  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(PERSONAS_DIR, file), "utf-8");
    const persona = yaml.load(content) as Persona;
    await client.execute({
      sql: `INSERT INTO personas (id, name, definition, source, created_at, updated_at)
            VALUES (?, ?, ?, 'yaml', datetime('now'), datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              definition = excluded.definition,
              updated_at = datetime('now')
            WHERE source = 'yaml'`,
      args: [persona.id, persona.name, JSON.stringify(persona)],
    });
  }
}

export async function listPersonas(client: Client): Promise<{ id: string; name: string }[]> {
  const result = await client.execute("SELECT id, name FROM personas ORDER BY name");
  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export async function getPersona(client: Client, id: string): Promise<Persona | undefined> {
  const result = await client.execute({
    sql: "SELECT definition FROM personas WHERE id = ?",
    args: [id],
  });
  if (!result.rows[0]) return undefined;
  return JSON.parse(result.rows[0].definition as string) as Persona;
}

export async function createPersona(client: Client, persona: Persona): Promise<void> {
  await client.execute({
    sql: `INSERT INTO personas (id, name, definition, source, created_at, updated_at)
         VALUES (?, ?, ?, 'db', datetime('now'), datetime('now'))`,
    args: [persona.id, persona.name, JSON.stringify(persona)],
  });
}

export async function updatePersona(client: Client, id: string, persona: Persona): Promise<void> {
  await client.execute({
    sql: `UPDATE personas SET name = ?, definition = ?, updated_at = datetime('now')
         WHERE id = ?`,
    args: [persona.name, JSON.stringify(persona), id],
  });
}

export async function deletePersona(client: Client, id: string): Promise<boolean> {
  const result = await client.execute("SELECT COUNT(*) as cnt FROM personas");
  const count = result.rows[0].cnt as number;
  if (count <= 1) return false;
  await client.execute({ sql: "DELETE FROM personas WHERE id = ?", args: [id] });
  return true;
}
