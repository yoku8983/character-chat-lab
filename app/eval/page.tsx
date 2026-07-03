import { notFound } from "next/navigation";
import Link from "next/link";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { ensureDb } from "@/lib/db";
import { listPersonas } from "@/lib/db-personas";
import EvalConsole from "@/components/EvalConsole";

export const dynamic = "force-dynamic";

export default async function EvalPage() {
  if (!isEvalUiEnabled()) {
    notFound();
  }

  const client = await ensureDb();
  const personas = await listPersonas(client);

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 md:py-10" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" className="text-sm" style={{ color: "var(--accent-hover)" }}>
              ← チャットに戻る
            </Link>
            <Link href="/usage" className="text-sm" style={{ color: "var(--accent-hover)" }}>
              利用状況（usage）
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
            評価コンソール（eval）
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            ペルソナ評価・知識クイズをローカルから実行し、進捗と履歴を確認します（ローカル専用機能）。
          </p>
        </div>

        <EvalConsole personas={personas} />
      </div>
    </div>
  );
}
