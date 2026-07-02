import fs from "fs";
import path from "path";

/**
 * 簡易 .env.local ローダ。
 * OPENROUTER_API_KEY が既に process.env にあれば何もしない。
 * 無ければリポジトリ直下の .env.local を読み、KEY=VALUE 行を process.env に載せる。
 * dotenv は使わない（依存を増やさないため自前実装）。
 */
export function loadEnv(): void {
  if (process.env.OPENROUTER_API_KEY) return;

  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // 前後のクォートを軽く除去
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
