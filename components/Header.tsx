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
  onToggleSidebar?: () => void;
  showSidebarToggle?: boolean;
}

function ModeButtons({
  mode,
  onModeChange,
  mobile,
}: {
  mode: "chat" | "convert" | "personas";
  onModeChange: (mode: "chat" | "convert" | "personas") => void;
  mobile?: boolean;
}) {
  const btnClass = mobile
    ? "px-3 py-1.5 text-sm transition-colors"
    : "px-6 py-2.5 text-lg transition-colors";

  const modeStyle = (active: boolean) => ({
    backgroundColor: active ? "var(--accent)" : "var(--bg-tertiary)",
    color: active ? "#ffffff" : "var(--text-primary)",
  });

  return (
    <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <button onClick={() => onModeChange("chat")} className={btnClass} style={modeStyle(mode === "chat")}>
        チャット
      </button>
      <button onClick={() => onModeChange("convert")} className={btnClass} style={modeStyle(mode === "convert")}>
        {mobile ? "変換" : "口調変換"}
      </button>
      <button onClick={() => onModeChange("personas")} className={btnClass} style={modeStyle(mode === "personas")}>
        {mobile ? "管理" : "ペルソナ管理"}
      </button>
    </div>
  );
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
  onToggleSidebar,
  showSidebarToggle,
}: HeaderProps) {
  return (
    <header
      className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 px-4 md:px-8 py-3 md:py-4 border-b"
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      {/* Row 1 on mobile: title + sidebar toggle + mode tabs */}
      <div className="flex items-center justify-between md:contents">
        <div className="flex items-center gap-2">
          {showSidebarToggle && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <h1
            className="text-xl md:text-3xl font-bold mr-0 md:mr-4 whitespace-nowrap"
            style={{ color: "var(--accent-hover)" }}
          >
            Character Chat Lab
          </h1>
        </div>

        {/* Mobile mode tabs (right side of row 1) */}
        <div className="md:hidden">
          <ModeButtons mode={mode} onModeChange={onModeChange} mobile />
        </div>
      </div>

      {/* Row 2 on mobile / inline on desktop: selectors + memory */}
      <div className="flex items-center gap-2 md:gap-3 overflow-x-auto">
        <div className="flex items-center gap-1 md:gap-3 min-w-0">
          <label className="hidden md:block text-base" style={{ color: "var(--text-secondary)" }}>
            キャラクター
          </label>
          <select
            value={selectedPersona}
            onChange={(e) => onPersonaChange(e.target.value)}
            className="text-sm md:text-lg rounded px-2 md:px-3 py-1.5 md:py-2 outline-none cursor-pointer max-w-[140px] md:max-w-none truncate"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 md:gap-3 min-w-0">
          <label className="hidden md:block text-base" style={{ color: "var(--text-secondary)" }}>
            モデル
          </label>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="text-sm md:text-lg rounded px-2 md:px-3 py-1.5 md:py-2 outline-none cursor-pointer max-w-[140px] md:max-w-none truncate"
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
          className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-sm md:text-base transition-colors whitespace-nowrap"
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
      </div>

      {/* Desktop mode tabs (right-aligned) */}
      <div className="hidden md:flex ml-auto">
        <ModeButtons mode={mode} onModeChange={onModeChange} />
      </div>
    </header>
  );
}
