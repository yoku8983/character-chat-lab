import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Persona } from "./types";

const PERSONAS_DIR = path.join(process.cwd(), "personas");

export function loadAllPersonas(): Persona[] {
  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((file) => {
    const content = fs.readFileSync(path.join(PERSONAS_DIR, file), "utf-8");
    return yaml.load(content) as Persona;
  });
}

export function loadPersona(id: string): Persona | undefined {
  const personas = loadAllPersonas();
  return personas.find((p) => p.id === id);
}
