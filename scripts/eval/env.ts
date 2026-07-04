import fs from "fs";
import path from "path";

/**
 * 簡易 .env.local ローダ。
 * リポジトリ直下の .env.local を読み、KEY=VALUE 行のうち process.env に
 * まだ無いキーだけを載せる（既存の環境変数が常に優先）。
 * dotenv は使わない（依存を増やさないため自前実装）。
 */
export function loadEnv(): void {
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
