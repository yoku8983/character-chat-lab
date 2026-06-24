"use client";

import { useState } from "react";

interface ConvertViewProps {
  personaId: string;
  personaName: string;
  modelId: string;
}

const CHINESE_MODEL_PREFIXES = ["deepseek/"];

export default function ConvertView({ personaId, personaName, modelId }: ConvertViewProps) {
  const [input, setInput] = useState("");
  const isChineseModel = CHINESE_MODEL_PREFIXES.some((p) => modelId.startsWith(p));
  const [result, setResult] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [copied, setCopied] = useState(false);
  const canClear = (!!input || !!result) && !isConverting;

  const handleConvert = async () => {
    const trimmed = input.trim();
    if (!trimmed || isConverting) return;

    setIsConverting(true);
    setResult("");
    setCopied(false);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, modelId, text: trimmed }),
      });

      if (!response.ok) {
        const error = await response.json();
        setResult(`エラー: ${error.error}`);
        setIsConverting(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setResult(accumulated);
      }
    } catch {
      setResult("エラー: 通信に失敗しました。");
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col px-3 md:px-8 py-4 md:py-8 gap-4 md:gap-8 h-full">
      {isChineseModel && (
        <div className="px-4 py-2 text-center text-xs md:text-sm rounded-lg" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          このモデルは中国企業が提供しています。個人情報やセンシティブな情報を入力しないでください。
        </div>
      )}
      <div className="text-center">
        <h2 className="text-xl md:text-3xl font-bold mb-1 md:mb-2">口調変換</h2>
        <p className="text-sm md:text-lg" style={{ color: "var(--text-secondary)" }}>
          テキストを<span className="font-medium" style={{ color: "var(--accent-hover)" }}>{personaName}</span>の口調に変換します
        </p>
      </div>

      <div className="flex flex-col md:flex-row flex-1 gap-4 md:gap-6 items-stretch min-h-0">
        <div className="flex-1 flex flex-col gap-2 md:gap-3 min-h-[180px] md:min-h-0">
          <label className="text-sm md:text-base font-medium" style={{ color: "var(--text-secondary)" }}>
            入力テキスト
          </label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="変換したいテキストを入力してください…"
            className="flex-1 resize-none rounded-xl px-3 md:px-5 py-3 md:py-4 text-base md:text-xl outline-none placeholder-gray-500"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
        </div>

        <div className="flex flex-row md:flex-col items-center justify-center gap-3 md:justify-between md:self-stretch md:py-12">
          <button
            onClick={handleConvert}
            disabled={isConverting || !input.trim()}
            className="rounded-full p-3 md:p-4 transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)", color: "white" }}
          >
            <svg className="rotate-90 md:rotate-0" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
          <button
            onClick={() => { if (canClear) { setInput(""); setResult(""); setCopied(false); } }}
            disabled={!canClear}
            className="px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            クリア
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-2 md:gap-3 min-h-[180px] md:min-h-0">
          <div className="flex items-center justify-between">
            <label className="text-sm md:text-base font-medium" style={{ color: "var(--text-secondary)" }}>
              変換結果
            </label>
            {result && !isConverting && (
              <button
                onClick={handleCopy}
                className="text-sm md:text-base px-3 md:px-4 py-1 md:py-1.5 rounded transition-colors"
                style={{
                  backgroundColor: copied ? "#22c55e" : "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {copied ? "コピーしました！" : "コピー"}
              </button>
            )}
          </div>
          <div
            className="flex-1 rounded-xl px-3 md:px-5 py-3 md:py-4 text-base md:text-xl overflow-y-auto whitespace-pre-wrap"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {isConverting && !result && (
              <span style={{ color: "var(--text-secondary)" }}>変換中…</span>
            )}
            {result}
            {isConverting && result && (
              <span className="inline-block w-2.5 h-6 ml-0.5 animate-pulse" style={{ backgroundColor: "var(--accent-hover)" }} />
            )}
            {!result && !isConverting && (
              <span style={{ color: "var(--text-secondary)" }}>ここに変換結果が表示されます</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
