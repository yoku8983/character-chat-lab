"use client";

import { useState, useEffect, useCallback } from "react";
import { Session } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

interface SessionSidebarProps {
  personaId: string;
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  refreshKey: number;
}

export default function SessionSidebar({
  personaId,
  currentSessionId,
  onSelectSession,
  onNewChat,
  refreshKey,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchSessions = useCallback(() => {
    fetch(`/api/sessions?personaId=${encodeURIComponent(personaId)}`)
      .then((res) => res.json())
      .then(setSessions);
  }, [personaId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/sessions/${deleteTarget}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchSessions();
    if (currentSessionId === deleteTarget) {
      onNewChat();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr + "Z");
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "たった今";
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}時間前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}日前`;
    return date.toLocaleDateString("ja-JP");
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: "280px",
        minWidth: "280px",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full py-2.5 rounded-lg text-base font-medium transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "white" }}
        >
          + 新規会話
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
            会話がありません
          </p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className="group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors"
            style={{
              backgroundColor:
                session.id === currentSessionId ? "var(--bg-tertiary)" : "transparent",
            }}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {session.title || "無題"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {formatTime(session.updatedAt)} · {session.messageCount ?? 0}件
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(session.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
              style={{ color: "var(--text-secondary)" }}
              title="削除"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          message="この会話を削除しますか？この操作は取り消せません。"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
