/**
 * persona:push — ペルソナ定義ファイルを DB（ローカル or 本番 Turso）へ upsert する CLI。
 *
 * 使い方:
 *   npm run persona:push -- --file personas/private/<id>.json
 *   LIBSQL_URL=libsql://... LIBSQL_AUTH_TOKEN=... npm run persona:push -- --file <path> --yes
 *
 * - 接続先はアプリ本体と同じ env（LIBSQL_URL / LIBSQL_AUTH_TOKEN）。未設定なら
 *   ローカル既定 DB（data/chat-lab.db）。.env.local があれば読み込む（アプリと同じ挙動）
 * - リモート DB（file: 以外）への push は --yes 必須（本番誤爆防止）
 * - 既存 id があれば UPDATE（name / definition のみ。profile_image は保持）、無ければ INSERT
 * - gitignore された personas/private/ に置いた実キャラ JSON を本番へ反映する用途を想定
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { ensureDb } from "../lib/db";
import { getPersona, createPersona, updatePersona } from "../lib/db-personas";
import { Persona } from "../lib/types";
import { loadEnv } from "./eval/env";

interface Args {
  file?: string;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") {
      args.file = argv[++i];
    } else if (argv[i] === "--yes") {
      args.yes = true;
    } else {
      throw new Error(`不明なオプションです: ${argv[i]}`);
    }
  }
  return args;
}

function loadPersonaFile(filePath: string): Persona {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  // JSON は YAML のサブセットなので yaml.load で両対応
  const persona = yaml.load(content) as Persona;

  if (!persona || typeof persona !== "object") {
    throw new Error("ペルソナ定義をパースできません（JSON / YAML のオブジェクトが必要です）");
  }
  if (!persona.id || typeof persona.id !== "string") {
    throw new Error("ペルソナ定義に id（空でない文字列）が必要です");
  }
  if (!persona.name || typeof persona.name !== "string") {
    throw new Error("ペルソナ定義に name（空でない文字列）が必要です");
  }
  const style = persona.identity?.speaking_style;
  if (!style?.first_person || !Array.isArray(style?.sentence_endings)) {
    throw new Error(
      "identity.speaking_style.first_person / sentence_endings が必要です（アプリ・評価ハーネスの前提スキーマ）"
    );
  }
  if (!Array.isArray(persona.examples) || persona.examples.length === 0) {
    throw new Error("examples（1件以上の配列）が必要です");
  }
  return persona;
}

function resolveTargetUrl(): string {
  return (
    process.env.LIBSQL_URL ||
    `file:${path.join(process.cwd(), "data", "chat-lab.db")}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error(
      "使い方: npm run persona:push -- --file <ペルソナ JSON/YAML のパス> [--yes]"
    );
    process.exit(1);
  }

  loadEnv();

  const persona = loadPersonaFile(args.file);
  const url = resolveTargetUrl();
  const isRemote = !url.startsWith("file:");

  console.log(`接続先 DB: ${url}`);
  console.log(`対象ペルソナ: id="${persona.id}" name="${persona.name}"`);

  if (isRemote && !args.yes) {
    console.error(
      "リモート DB（本番 Turso 等）への push には --yes フラグが必要です。中断しました。"
    );
    process.exit(1);
  }

  const client = await ensureDb();
  const existing = await getPersona(client, persona.id);
  if (existing) {
    await updatePersona(client, persona.id, persona);
    console.log(`✅ 既存ペルソナを更新しました（UPDATE。profile_image は保持されます）`);
  } else {
    await createPersona(client, persona);
    console.log(`✅ 新規ペルソナを登録しました（INSERT, source='db'）`);
  }
  client.close();
}

main().catch((err) => {
  console.error(`エラー: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
