"use client";

import { Model } from "@/lib/types";

interface PersonaSummary {
  id: string;
  name: string;
}

interface HeaderProps {
  personas: PersonaSummary[];
  selectedPersona: string;
  onPersonaChange: (id: string) => void;
  models: Model[];
  selectedModel: string;
  onModelChange: (id: string) => void;
  mode: "chat" | "convert" | "personas";
  onModeChange: (mode: "chat" | "convert" | "personas") => void;
  onToggleMemory: () => void;
  memoryCount: number;
}

export default function Header({
  personas,
  selectedPersona,
  onPersonaChange,
  models,
  selectedModel,
  onModelChange,
  mode,
  onModeChange,
  onToggleMemory,
  memoryCount,
}: HeaderProps) {
  return (
    <header className="flex items-center gap-6 px-8 py-4 border-b" style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}>
      <h1 className="text-3xl font-bold mr-4 whitespace-nowrap" style={{ color: "var(--accent-hover)" }}>
        Character Chat Lab
      </h1>

      <div className="flex items-center gap-3">
        <label className="text-base" style={{ color: "var(--text-secondary)" }}>
          キャラクター
        </label>
        <select
          value={selectedPersona}
          onChange={(e) => onPersonaChange(e.target.value)}
          className="text-lg rounded px-3 py-2 outline-none cursor-pointer"
          style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-base" style={{ color: "var(--text-secondary)" }}>
          モデル
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="text-lg rounded px-3 py-2 outline-none cursor-pointer"
          style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.description})
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={onToggleMemory}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-base transition-colors"
        style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
      >
        記憶
        {memoryCount > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--accent)", color: "white" }}
          >
            {memoryCount}
          </span>
        )}
      </button>

      <div className="flex ml-auto rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <button
          onClick={() => onModeChange("chat")}
          className="px-6 py-2.5 text-lg transition-colors"
          style={{
            backgroundColor: mode === "chat" ? "var(--accent)" : "var(--bg-tertiary)",
            color: mode === "chat" ? "#ffffff" : "var(--text-primary)",
          }}
        >
          チャット
        </button>
        <button
          onClick={() => onModeChange("convert")}
          className="px-6 py-2.5 text-lg transition-colors"
          style={{
            backgroundColor: mode === "convert" ? "var(--accent)" : "var(--bg-tertiary)",
            color: mode === "convert" ? "#ffffff" : "var(--text-primary)",
          }}
        >
          口調変換
        </button>
        <button
          onClick={() => onModeChange("personas")}
          className="px-6 py-2.5 text-lg transition-colors"
          style={{
            backgroundColor: mode === "personas" ? "var(--accent)" : "var(--bg-tertiary)",
            color: mode === "personas" ? "#ffffff" : "var(--text-primary)",
          }}
        >
          ペルソナ管理
        </button>
      </div>
    </header>
  );
}
