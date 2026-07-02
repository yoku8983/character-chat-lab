import { Client, Row } from "@libsql/client";
import crypto from "crypto";
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

  // 過去に一度シードした YAML ペルソナの ID → content_hash マップ
  // ハッシュが一致すればスキップ、相違すれば source='yaml' の行のみ再反映する
  // （source='db' は UI 作成ペルソナ保護のため対象外。ユーザーが削除済みなら 0 行更新で復活しない）
  const seededResult = await client.execute("SELECT id, content_hash FROM seeded_personas");
  const seeded = new Map(
    seededResult.rows.map((row) => [row.id as string, row.content_hash as string | null])
  );

  for (const file of files) {
    const content = fs.readFileSync(path.join(PERSONAS_DIR, file), "utf-8");
    const persona = yaml.load(content) as Persona;
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    if (!seeded.has(persona.id)) {
      // 未シード: 新規投入
      await client.batch([
        {
          sql: `INSERT INTO personas (id, name, definition, source, created_at, updated_at)
                VALUES (?, ?, ?, 'yaml', datetime('now'), datetime('now'))
                ON CONFLICT(id) DO NOTHING`,
          args: [persona.id, persona.name, JSON.stringify(persona)],
        },
        {
          sql: `INSERT INTO seeded_personas (id, content_hash) VALUES (?, ?)
                ON CONFLICT(id) DO NOTHING`,
          args: [persona.id, contentHash],
        },
      ]);
      continue;
    }

    if (seeded.get(persona.id) === contentHash) {
      // ハッシュ一致: 変更なしのためスキップ
      continue;
    }

    // ハッシュ相違（YAML が更新された）: source='yaml' の行のみ再反映
    await client.batch([
      {
        sql: `UPDATE personas SET name = ?, definition = ?, updated_at = datetime('now')
              WHERE id = ? AND source = 'yaml'`,
        args: [persona.name, JSON.stringify(persona), persona.id],
      },
      {
        sql: `UPDATE seeded_personas SET content_hash = ? WHERE id = ?`,
        args: [contentHash, persona.id],
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

export async function updatePersona(client: Client, id: string, persona: Persona): Promise<boolean> {
  // source の昇格はしない: UI 編集した source='yaml' ペルソナは次回 YAML 更新（ハッシュ相違）で上書きされ得る（設計上の割り切り）
  const result = await client.execute({
    sql: `UPDATE personas SET name = ?, definition = ?, updated_at = datetime('now')
         WHERE id = ?`,
    args: [persona.name, JSON.stringify(persona), id],
  });
  return result.rowsAffected > 0;
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
