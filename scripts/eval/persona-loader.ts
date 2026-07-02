import fs from "fs";
import yaml from "js-yaml";
import { loadPersona } from "../../lib/personas";
import { Persona } from "../../lib/types";

function assertPersonaShape(persona: Persona): void {
  const style = persona?.identity?.speaking_style;
  if (!style?.first_person || !Array.isArray(style?.sentence_endings)) {
    throw new Error(
      "このスキーマは評価マーカーを生成できません（identity.speaking_style.first_person / sentence_endings が必要です）"
    );
  }
}

export function loadPersonaSource(opts: { id?: string; file?: string }): Persona {
  if (opts.file) {
    const content = fs.readFileSync(opts.file, "utf-8");
    const persona = yaml.load(content) as Persona;
    assertPersonaShape(persona);
    return persona;
  }

  if (opts.id) {
    const persona = loadPersona(opts.id);
    if (!persona) {
      throw new Error(`ペルソナ "${opts.id}" が見つかりません`);
    }
    assertPersonaShape(persona);
    return persona;
  }

  throw new Error("loadPersonaSource には id か file のどちらかを指定してください");
}
