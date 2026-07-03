const DEFAULT_USD_JPY_RATE = 155;

/**
 * 環境変数 USD_JPY_RATE から USD→JPY 換算レートを取得する。
 * 未設定・不正値（0以下、NaN、Infinity など）の場合はデフォルト値(155)を返す。
 */
export function getUsdJpyRate(): number {
  const raw = Number(process.env.USD_JPY_RATE);
  if (raw > 0 && Number.isFinite(raw)) {
    return raw;
  }
  return DEFAULT_USD_JPY_RATE;
}

/**
 * USD 金額を指定レートで円換算し、表示用文字列を返す。
 * 円換算後の値が ¥10 未満の場合は小数第1位まで、¥10 以上の場合は
 * 整数に丸めて toLocaleString("ja-JP") で3桁区切り表示する。
 */
export function formatJpy(usd: number, rate: number): string {
  const jpy = usd * rate;
  if (jpy < 10) {
    return `¥${jpy.toFixed(1)}`;
  }
  return `¥${Math.round(jpy).toLocaleString("ja-JP")}`;
}

/**
 * USD 金額を小数第4位までの表示用文字列に整形する。
 */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
