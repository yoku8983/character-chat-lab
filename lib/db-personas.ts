import { Client, Row } from "@libsql/client";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona, PersonaSummary } from "./types";

const PERSONAS_DIR = path.join(process.cwd(), "personas");

export async function syncYamlPersonas(client: Client): Promise<void> {
  if (!fs.existsSync(PERSONAS_DIR)) return;

  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  // 過去に一度シードした YAML ペルソナの ID 一覧
  const seededResult = await client.execute("SELECT id FROM seeded_personas");
  const seeded = new Set(seededResult.rows.map((row) => row.id as string));

  for (const file of files) {
    const content = fs.readFileSync(path.join(PERSONAS_DIR, file), "utf-8");
    const persona = yaml.load(content) as Persona;

    // 一度シード済みの YAML は再投入しない（ユーザーが削除したら復活させない）
    if (seeded.has(persona.id)) continue;

    await client.batch([
      {
        sql: `INSERT INTO personas (id, name, definition, source, created_at, updated_at)
              VALUES (?, ?, ?, 'yaml', datetime('now'), datetime('now'))
              ON CONFLICT(id) DO NOTHING`,
        args: [persona.id, persona.name, JSON.stringify(persona)],
      },
      {
        sql: `INSERT INTO seeded_personas (id) VALUES (?)
              ON CONFLICT(id) DO NOTHING`,
        args: [persona.id],
      },
    ]);
  }
}

export async function listPersonas(client: Client): Promise<PersonaSummary[]> {
  const result = await client.execute(
    "SELECT id, name, (profile_image IS NOT NULL) as has_image FROM personas ORDER BY name"
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    hasProfileImage: Boolean(row.has_image),
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

export async function getPersonaImage(client: Client, id: string): Promise<string | null> {
  const result = await client.execute({
    sql: "SELECT profile_image FROM personas WHERE id = ?",
    args: [id],
  });
  if (!result.rows[0]) return null;
  return (result.rows[0].profile_image as string) ?? null;
}

export async function setPersonaImage(client: Client, id: string, base64WebP: string): Promise<void> {
  await client.execute({
    sql: "UPDATE personas SET profile_image = ?, updated_at = datetime('now') WHERE id = ?",
    args: [base64WebP, id],
  });
}

export async function deletePersonaImage(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: "UPDATE personas SET profile_image = NULL, updated_at = datetime('now') WHERE id = ?",
    args: [id],
  });
}
