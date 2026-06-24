import { Persona } from "./types";

export function buildSystemPrompt(persona: Persona, episodicMemories?: string[]): string {
  const { identity, knowledge, memory, behavior } = persona;
  const style = identity.speaking_style;

  const parts: string[] = [];

  parts.push(`あなたは「${persona.name}」というキャラクターです。以下の設定に従って、このキャラクターとして一貫して振る舞ってください。`);

  parts.push(`\n## 性格\n${identity.personality.trim()}`);
  parts.push(`\n## 経歴\n${identity.background.trim()}`);

  parts.push(`\n## 話し方`);
  parts.push(`- 一人称: ${style.first_person}`);
  parts.push(`- トーン: ${style.tone}`);
  if (style.sentence_endings.length > 0) {
    parts.push(`- 特徴的な語尾: ${style.sentence_endings.join("、")}`);
  }
  if (style.catchphrases.length > 0) {
    parts.push(`- 口癖: ${style.catchphrases.join("、")}`);
  }
  if (style.vocabulary_notes) {
    parts.push(`- 語彙の特徴: ${style.vocabulary_notes.trim()}`);
  }

  if (knowledge.domains.length > 0) {
    parts.push(`\n## 固有知識`);
    for (const domain of knowledge.domains) {
      parts.push(`### ${domain.topic}\n${domain.content.trim()}`);
    }
  }

  if (memory.entries.length > 0) {
    parts.push(`\n## 記憶`);
    for (const entry of memory.entries) {
      parts.push(`- ${entry}`);
    }
  }

  if (episodicMemories && episodicMemories.length > 0) {
    parts.push(`\n## エピソード記憶（過去の会話から）`);
    for (const mem of episodicMemories) {
      parts.push(`- ${mem}`);
    }
  }

  if (behavior.constraints.length > 0) {
    parts.push(`\n## 行動制約`);
    for (const constraint of behavior.constraints) {
      parts.push(`- ${constraint}`);
    }
  }

  parts.push(`\n## 重要な指示`);
  parts.push(`- 常に${persona.name}として応答してください。メタ的な言及（「私はAIです」等）は避けてください。`);
  parts.push(`- 一人称は必ず「${style.first_person}」を使ってください。`);
  parts.push(`- 上記の口調・語尾・口癖を自然に織り交ぜてください。`);

  return parts.join("\n");
}

export function buildFewShotMessages(
  persona: Persona
): { role: "user" | "assistant"; content: string }[] {
  return persona.examples.flatMap((ex) => [
    { role: "user" as const, content: ex.user },
    { role: "assistant" as const, content: ex.assistant },
  ]);
}

export function buildConvertSystemPrompt(persona: Persona): string {
  const { identity } = persona;
  const style = identity.speaking_style;

  const parts: string[] = [];

  parts.push(
    `あなたはテキストの口調変換を行う専門家です。ユーザーから与えられたテキストを、指定されたキャラクター「${persona.name}」の口調・話し方で書き直してください。`
  );

  parts.push(`\n## 重要なルール`);
  parts.push(`- 入力テキストの意味・内容・情報をすべて保持してください。`);
  parts.push(`- 口調・語尾・一人称・語彙のみを変換してください。`);
  parts.push(
    `- 入力テキストに対する返答や感想を生成しないでください。あくまで入力テキストの「言い換え」です。`
  );
  parts.push(
    `- 新しい情報を追加したり、内容を省略したりしないでください。`
  );
  parts.push(
    `- 変換結果のみを出力し、説明・注釈・前置きは付けないでください。`
  );

  parts.push(`\n## 「${persona.name}」の話し方の特徴`);
  parts.push(`- 一人称: ${style.first_person}`);
  parts.push(`- トーン: ${style.tone}`);
  if (style.sentence_endings.length > 0) {
    parts.push(`- 特徴的な語尾: ${style.sentence_endings.join("、")}`);
  }
  if (style.catchphrases.length > 0) {
    parts.push(`- 口癖: ${style.catchphrases.join("、")}`);
  }
  if (style.vocabulary_notes) {
    parts.push(`- 語彙の特徴: ${style.vocabulary_notes.trim()}`);
  }

  if (identity.personality) {
    parts.push(`\n## 性格（語調の参考）`);
    parts.push(identity.personality.trim());
  }

  return parts.join("\n");
}

export function buildConvertPrompt(persona: Persona): string {
  return buildConvertSystemPrompt(persona);
}
