import Link from "next/link";
import { ensureDb } from "@/lib/db";
import { getUsageSummary } from "@/lib/db-usage-log";
import { getUsdJpyRate, formatJpy, formatUsd } from "@/lib/jpy";

export const dynamic = "force-dynamic";

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function CostText({ cost, rate }: { cost: number; rate: number }) {
  return (
    <>
      <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {formatJpy(cost, rate)}
      </span>
      <span className="text-xs ml-1" style={{ color: "var(--text-secondary)" }}>
        ({formatUsd(cost)})
      </span>
    </>
  );
}

export default async function UsagePage() {
  const client = await ensureDb();
  const summary = await getUsageSummary(client);
  const rate = getUsdJpyRate();
  const evalUiEnabled = Boolean(process.env.EVAL_UI_ENABLED);

  return (
    <div className="min-h-screen px-4 md:px-8 py-6 md:py-10" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" className="text-sm" style={{ color: "var(--accent-hover)" }}>
              ← チャットに戻る
            </Link>
            {evalUiEnabled && (
              <Link href="/eval" className="text-sm" style={{ color: "var(--accent-hover)" }}>
                評価コンソール
              </Link>
            )}
          </div>
          <h1 className="text-xl md:text-2xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
            利用状況（usage）
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            OpenRouter API のトークン使用量・コストの集計です。
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            円換算は USD_JPY_RATE={rate} による目安です。
          </p>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            className="rounded-xl p-4 md:p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
              今日
            </h2>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>呼び出し数</p>
            <p className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {formatNumber(summary.today.calls)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>コスト</p>
            <p>
              <CostText cost={summary.today.cost} rate={rate} />
            </p>
          </div>

          <div
            className="rounded-xl p-4 md:p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
              今月
            </h2>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>呼び出し数</p>
            <p className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {formatNumber(summary.thisMonth.calls)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>コスト</p>
            <p>
              <CostText cost={summary.thisMonth.cost} rate={rate} />
            </p>
          </div>

          <div
            className="rounded-xl p-4 md:p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
              累計
            </h2>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>呼び出し数</p>
            <p className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {formatNumber(summary.overall.calls)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>コスト</p>
            <p>
              <CostText cost={summary.overall.cost} rate={rate} />
            </p>
          </div>
        </section>

        <section
          className="rounded-xl p-4 md:p-6"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            全体サマリ
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>呼び出し数</p>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{formatNumber(summary.overall.calls)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>prompt tokens</p>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{formatNumber(summary.overall.promptTokens)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>completion tokens</p>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{formatNumber(summary.overall.completionTokens)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>cache hit rate</p>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{formatRate(summary.overall.cacheHitRate)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>コスト</p>
              <p><CostText cost={summary.overall.cost} rate={rate} /></p>
            </div>
          </div>
        </section>

        <section
          className="rounded-xl p-4 md:p-6"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            モデル別
          </h2>
          {summary.byModel.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>まだデータがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 pr-4" style={{ color: "var(--text-secondary)" }}>モデル</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>呼び出し数</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>prompt</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>completion</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>cached</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>cache hit率</th>
                    <th className="text-right py-2 pl-4" style={{ color: "var(--text-secondary)" }}>コスト</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map((m) => (
                    <tr key={m.modelId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{m.modelId}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(m.calls)}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(m.promptTokens)}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(m.completionTokens)}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(m.cachedTokens)}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatRate(m.cacheHitRate)}</td>
                      <td className="text-right py-2 pl-4" style={{ color: "var(--text-primary)" }}><CostText cost={m.cost} rate={rate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className="rounded-xl p-4 md:p-6"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            月別コスト
          </h2>
          {summary.byMonth.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>まだデータがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 pr-4" style={{ color: "var(--text-secondary)" }}>月</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>呼び出し数</th>
                    <th className="text-right py-2 pl-4" style={{ color: "var(--text-secondary)" }}>コスト</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byMonth.map((mo) => (
                    <tr key={mo.month} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{mo.month}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(mo.calls)}</td>
                      <td className="text-right py-2 pl-4" style={{ color: "var(--text-primary)" }}><CostText cost={mo.cost} rate={rate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className="rounded-xl p-4 md:p-6"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          <h2 className="text-base md:text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            日別コスト
          </h2>
          {summary.byDay.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>まだデータがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 pr-4" style={{ color: "var(--text-secondary)" }}>日付</th>
                    <th className="text-right py-2 px-4" style={{ color: "var(--text-secondary)" }}>呼び出し数</th>
                    <th className="text-right py-2 pl-4" style={{ color: "var(--text-secondary)" }}>コスト</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDay.map((d) => (
                    <tr key={d.day} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{d.day}</td>
                      <td className="text-right py-2 px-4" style={{ color: "var(--text-primary)" }}>{formatNumber(d.calls)}</td>
                      <td className="text-right py-2 pl-4" style={{ color: "var(--text-primary)" }}><CostText cost={d.cost} rate={rate} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
