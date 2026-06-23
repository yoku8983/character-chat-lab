import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona } from "./types";

const PERSONAS_DIR = path.join(process.cwd(), "personas");

export function syncYamlPersonas(db: Database.Database): void {
  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  const upsert = db.prepare(`
    INSERT INTO personas (id, name, definition, source, created_at, updated_at)
    VALUES (@id, @name, @definition, 'yaml', datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = @name,
      definition = @definition,
      updated_at = datetime('now')
    WHERE source = 'yaml'
  `);

  const syncAll = db.transaction(() => {
    for (const file of files) {
      const content = fs.readFileSync(path.join(PERSONAS_DIR, file), "utf-8");
      const persona = yaml.load(content) as Persona;
      upsert.run({
        id: persona.id,
        name: persona.name,
        definition: JSON.stringify(persona),
      });
    }
  });

  syncAll();
}

export function listPersonas(db: Database.Database): { id: string; name: string }[] {
  return db
    .prepare("SELECT id, name FROM personas ORDER BY name")
    .all() as { id: string; name: string }[];
}

export function getPersona(db: Database.Database, id: string): Persona | undefined {
  const row = db
    .prepare("SELECT definition FROM personas WHERE id = ?")
    .get(id) as { definition: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.definition) as Persona;
}

export function createPersona(db: Database.Database, persona: Persona): void {
  db.prepare(`
    INSERT INTO personas (id, name, definition, source, created_at, updated_at)
    VALUES (@id, @name, @definition, 'db', datetime('now'), datetime('now'))
  `).run({
    id: persona.id,
    name: persona.name,
    definition: JSON.stringify(persona),
  });
}

export function updatePersona(db: Database.Database, id: string, persona: Persona): void {
  db.prepare(`
    UPDATE personas SET name = @name, definition = @definition, updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    name: persona.name,
    definition: JSON.stringify(persona),
  });
}

export function deletePersona(db: Database.Database, id: string): boolean {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM personas").get() as { cnt: number };
  if (count.cnt <= 1) return false;
  db.prepare("DELETE FROM personas WHERE id = ?").run(id);
  return true;
}
