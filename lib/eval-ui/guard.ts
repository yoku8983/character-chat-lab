/**
 * 評価 GUI 機能全体のフィーチャーフラグガード。
 *
 * `EVAL_UI_ENABLED` が "1" または "true" の場合のみ有効。
 * app/usage/page.tsx のインラインチェックとセマンティクスを厳密に一致させること。
 */
export function isEvalUiEnabled(): boolean {
  return (
    process.env.EVAL_UI_ENABLED === "1" || process.env.EVAL_UI_ENABLED === "true"
  );
}
