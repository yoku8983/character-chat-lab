"use client";

import { useState } from "react";
import { Persona } from "@/lib/types";

interface PersonaEditorProps {
  persona?: Persona;
  onSave: () => void;
  onCancel: () => void;
}

function emptyPersona(): Persona {
  return {
    id: "",
    name: "",
    identity: {
      personality: "",
      background: "",
      speaking_style: {
        first_person: "",
        tone: "",
        sentence_endings: [],
        catchphrases: [],
        vocabulary_notes: "",
      },
    },
    knowledge: { domains: [] },
    memory: { type: "static", entries: [] },
    behavior: { constraints: [] },
    examples: [],
  };
}

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w぀-ゟ゠-ヿ一-龯]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "persona";
}

export default function PersonaEditor({ persona, onSave, onCancel }: PersonaEditorProps) {
  const isNew = !persona;
  const [form, setForm] = useState<Persona>(persona ?? emptyPersona());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  const [endingInput, setEndingInput] = useState("");
  const [catchphraseInput, setCatchphraseInput] = useState("");
  const [showReference, setShowReference] = useState(false);

  const handleReset = () => {
    const initial = persona ?? emptyPersona();
    setForm(initial);
    if (editMode === "json") {
      setJsonText(JSON.stringify(initial, null, 2));
    }
    setJsonError("");
    setError("");
    setEndingInput("");
    setCatchphraseInput("");
  };

  const update = (fn: (p: Persona) => void) => {
    setForm((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as Persona;
      fn(next);
      return next;
    });
  };

  const handleSave = async (overrideData?: Persona) => {
    const data = overrideData ?? form;
    if (!data.name.trim()) {
      setError("名前は必須です");
      return;
    }
    setSaving(true);
    setError("");

    const saveData = { ...data };
    if (isNew) {
      saveData.id = generateId(data.name);
    }

    try {
      if (isNew) {
        const res = await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveData),
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.error);
          setSaving(false);
          return;
        }
      } else {
        await fetch(`/api/personas/${saveData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveData),
        });
      }
      onSave();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const switchToJson = () => {
    setJsonText(JSON.stringify(form, null, 2));
    setJsonError("");
    setEditMode("json");
  };

  const switchToForm = () => {
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText) as Persona;
        setForm(parsed);
        setJsonError("");
      } catch {
        setJsonError("JSON の構文エラーがあります。修正してから切り替えてください");
        return;
      }
    }
    setEditMode("form");
  };

  const inputStyle = {
    backgroundColor: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };

  const labelClass = "text-sm font-medium mb-1 block";

  const tabStyle = (active: boolean) => ({
    backgroundColor: active ? "var(--accent)" : "var(--bg-tertiary)",
    color: active ? "#ffffff" : "var(--text-primary)",
  });

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold">
            {isNew ? "新規ペルソナ作成" : `${form.name} を編集`}
          </h2>
          <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <button
              onClick={editMode === "form" ? undefined : switchToForm}
              className="px-5 py-2 text-base transition-colors"
              style={tabStyle(editMode === "form")}
            >
              フォーム
            </button>
            <button
              onClick={editMode === "json" ? undefined : switchToJson}
              className="px-5 py-2 text-base transition-colors"
              style={tabStyle(editMode === "json")}
            >
              JSON
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {editMode === "json" ? (
          <div className="space-y-4">
            {jsonError && (
              <div className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}>
                {jsonError}
              </div>
            )}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-secondary)" }}>
              <button
                onClick={() => setShowReference((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium"
                style={{ color: "var(--text-secondary)", borderBottom: showReference ? "1px solid var(--border)" : "none" }}
              >
                <span>JSON キー凡例</span>
                <span>{showReference ? "▲ 閉じる" : "▼ 開く"}</span>
              </button>
              {showReference && (
                <div className="px-5 py-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <table className="w-full">
                    <tbody>
                      <tr><td className="font-mono pr-4 py-0.5 whitespace-nowrap" style={{ color: "var(--text-primary)" }}>name</td><td>キャラクター名（必須）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.personality</td><td>性格の記述</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.background</td><td>経歴・背景</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.speaking_style.first_person</td><td>一人称（例: わたし、俺）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.speaking_style.tone</td><td>口調（例: casual、formal）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.speaking_style.sentence_endings</td><td>語尾の配列（例: [&quot;だよ&quot;, &quot;ね&quot;]）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.speaking_style.catchphrases</td><td>口癖の配列</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>identity.speaking_style.vocabulary_notes</td><td>語彙の特徴</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>knowledge.domains[]</td><td>固有知識（topic + content のペア）</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>memory.entries[]</td><td>静的記憶の配列</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>behavior.constraints[]</td><td>行動制約の配列</td></tr>
                      <tr><td className="font-mono pr-4 py-0.5" style={{ color: "var(--text-primary)" }}>examples[]</td><td>会話例（user + assistant のペア）</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setJsonError(""); }}
              className="w-full rounded-xl px-5 py-4 text-sm font-mono outline-none resize-none"
              style={{ ...inputStyle, minHeight: "60vh" }}
              spellCheck={false}
            />
          </div>
        ) : (

        <div className="space-y-6">
          {/* 基本情報 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>基本情報</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>名前 *</label>
                <input
                  value={form.name}
                  onChange={(e) => update((p) => { p.name = e.target.value; })}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none"
                  style={inputStyle}
                  placeholder="キャラクター名"
                />
              </div>
            </div>
          </section>

          {/* 性格・背景 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>性格・背景</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>性格</label>
                <textarea
                  value={form.identity.personality}
                  onChange={(e) => update((p) => { p.identity.personality = e.target.value; })}
                  rows={4}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none resize-none"
                  style={inputStyle}
                  placeholder="性格の詳細記述"
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>経歴</label>
                <textarea
                  value={form.identity.background}
                  onChange={(e) => update((p) => { p.identity.background = e.target.value; })}
                  rows={4}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none resize-none"
                  style={inputStyle}
                  placeholder="キャラクターの来歴"
                />
              </div>
            </div>
          </section>

          {/* 話し方 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>話し方</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>一人称</label>
                <input
                  value={form.identity.speaking_style.first_person}
                  onChange={(e) => update((p) => { p.identity.speaking_style.first_person = e.target.value; })}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none"
                  style={inputStyle}
                  placeholder="俺、わたし等"
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-secondary)" }}>トーン</label>
                <input
                  value={form.identity.speaking_style.tone}
                  onChange={(e) => update((p) => { p.identity.speaking_style.tone = e.target.value; })}
                  className="w-full rounded-lg px-4 py-2 text-base outline-none"
                  style={inputStyle}
                  placeholder="casual、formal等"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass} style={{ color: "var(--text-secondary)" }}>語尾</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.identity.speaking_style.sentence_endings.map((e, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
                  >
                    {e}
                    <button
                      onClick={() => update((p) => { p.identity.speaking_style.sentence_endings.splice(i, 1); })}
                      className="text-xs ml-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={endingInput}
                  onChange={(e) => setEndingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && endingInput.trim()) {
                      e.preventDefault();
                      update((p) => { p.identity.speaking_style.sentence_endings.push(endingInput.trim()); });
                      setEndingInput("");
                    }
                  }}
                  className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                  style={inputStyle}
                  placeholder="追加してEnter"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass} style={{ color: "var(--text-secondary)" }}>口癖</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.identity.speaking_style.catchphrases.map((c, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-sm"
                    style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
                  >
                    {c}
                    <button
                      onClick={() => update((p) => { p.identity.speaking_style.catchphrases.splice(i, 1); })}
                      className="text-xs ml-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={catchphraseInput}
                  onChange={(e) => setCatchphraseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && catchphraseInput.trim()) {
                      e.preventDefault();
                      update((p) => { p.identity.speaking_style.catchphrases.push(catchphraseInput.trim()); });
                      setCatchphraseInput("");
                    }
                  }}
                  className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                  style={inputStyle}
                  placeholder="追加してEnter"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass} style={{ color: "var(--text-secondary)" }}>語彙の特徴</label>
              <textarea
                value={form.identity.speaking_style.vocabulary_notes}
                onChange={(e) => update((p) => { p.identity.speaking_style.vocabulary_notes = e.target.value; })}
                rows={2}
                className="w-full rounded-lg px-4 py-2 text-base outline-none resize-none"
                style={inputStyle}
                placeholder="語彙に関する特徴"
              />
            </div>
          </section>

          {/* 知識 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>固有知識</h3>
            {form.knowledge.domains.map((d, i) => (
              <div key={i} className="mb-3 p-4 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="flex justify-between items-center mb-2">
                  <input
                    value={d.topic}
                    onChange={(e) => update((p) => { p.knowledge.domains[i].topic = e.target.value; })}
                    className="flex-1 rounded px-3 py-1 text-sm outline-none"
                    style={inputStyle}
                    placeholder="トピック名"
                  />
                  <button
                    onClick={() => update((p) => { p.knowledge.domains.splice(i, 1); })}
                    className="ml-2 text-sm"
                    style={{ color: "#dc2626" }}
                  >
                    削除
                  </button>
                </div>
                <textarea
                  value={d.content}
                  onChange={(e) => update((p) => { p.knowledge.domains[i].content = e.target.value; })}
                  rows={3}
                  className="w-full rounded px-3 py-1 text-sm outline-none resize-none"
                  style={inputStyle}
                  placeholder="知識の内容"
                />
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.knowledge.domains.push({ topic: "", content: "" }); })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 知識を追加
            </button>
          </section>

          {/* 記憶 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>静的記憶</h3>
            {form.memory.entries.map((entry, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={entry}
                  onChange={(e) => update((p) => { p.memory.entries[i] = e.target.value; })}
                  className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <button
                  onClick={() => update((p) => { p.memory.entries.splice(i, 1); })}
                  className="text-sm px-2"
                  style={{ color: "#dc2626" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.memory.entries.push(""); })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 記憶を追加
            </button>
          </section>

          {/* 制約 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>行動制約</h3>
            {form.behavior.constraints.map((c, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={c}
                  onChange={(e) => update((p) => { p.behavior.constraints[i] = e.target.value; })}
                  className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
                  style={inputStyle}
                />
                <button
                  onClick={() => update((p) => { p.behavior.constraints.splice(i, 1); })}
                  className="text-sm px-2"
                  style={{ color: "#dc2626" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.behavior.constraints.push(""); })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 制約を追加
            </button>
          </section>

          {/* 会話例 */}
          <section>
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--accent-hover)" }}>会話例 (few-shot)</h3>
            {form.examples.map((ex, i) => (
              <div key={i} className="mb-3 p-4 rounded-lg" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>例 {i + 1}</span>
                  <button
                    onClick={() => update((p) => { p.examples.splice(i, 1); })}
                    className="text-sm"
                    style={{ color: "#dc2626" }}
                  >
                    削除
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>ユーザー</label>
                    <input
                      value={ex.user}
                      onChange={(e) => update((p) => { p.examples[i].user = e.target.value; })}
                      className="w-full rounded px-3 py-1 text-sm outline-none"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>アシスタント</label>
                    <textarea
                      value={ex.assistant}
                      onChange={(e) => update((p) => { p.examples[i].assistant = e.target.value; })}
                      rows={2}
                      className="w-full rounded px-3 py-1 text-sm outline-none resize-none"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => update((p) => { p.examples.push({ user: "", assistant: "" }); })}
              className="text-sm px-4 py-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            >
              + 会話例を追加
            </button>
          </section>
        </div>

        )}

        <div className="flex gap-4 mt-8 mb-8">
          <button
            onClick={() => {
              if (editMode === "json" && jsonText) {
                try {
                  const parsed = JSON.parse(jsonText) as Persona;
                  setJsonError("");
                  handleSave(parsed);
                  return;
                } catch {
                  setJsonError("JSON の構文エラーがあります");
                  return;
                }
              }
              handleSave();
            }}
            disabled={saving}
            className="px-8 py-3 rounded-xl text-lg font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)", color: "white" }}
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            onClick={onCancel}
            className="px-8 py-3 rounded-xl text-lg font-medium transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
          >
            キャンセル
          </button>
          <button
            onClick={handleReset}
            className="px-8 py-3 rounded-xl text-lg font-medium transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            リセット
          </button>
        </div>
      </div>
    </div>
  );
}
