"use client";

import { useState, useEffect, useCallback } from "react";
import { Memory, ChatMessage } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

interface MemoryPanelProps {
  personaId: string;
  personaName: string;
  modelId: string;
  currentMessages: ChatMessage[];
  sessionId: string | null;
  onClose: () => void;
}

export default function MemoryPanel({
  personaId,
  personaName,
  modelId,
  currentMessages,
  sessionId,
  onClose,
}: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editImportance, setEditImportance] = useState(5);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newImportance, setNewImportance] = useState(5);

  const fetchMemories = useCallback(() => {
    fetch(`/api/memories?personaId=${encodeURIComponent(personaId)}`)
      .then((res) => res.json())
      .then(setMemories);
  }, [personaId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleExtract = async () => {
    if (currentMessages.length === 0) return;
    setIsExtracting(true);
    try {
      await fetch("/api/memories/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, modelId, messages: currentMessages, sessionId }),
      });
      fetchMemories();
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, content: newContent, importance: newImportance }),
    });
    setNewContent("");
    setNewImportance(5);
    setAddMode(false);
    fetchMemories();
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    await fetch(`/api/memories/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent, importance: editImportance }),
    });
    setEditingId(null);
    fetchMemories();
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    await fetch(`/api/memories/${deleteTarget}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchMemories();
  };

  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditImportance(memory.importance);
  };

  return (
    <div
      className="fixed inset-0 flex justify-end z-40"
      style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
      onClick={onClose}
    >
      <div
        className="h-full flex flex-col overflow-hidden"
        style={{
          width: "420px",
          backgroundColor: "var(--bg-primary)",
          borderLeft: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-xl font-bold">
            {personaName}の記憶 ({memories.length}件)
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-secondary)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={handleExtract}
            disabled={isExtracting || currentMessages.length === 0}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: "var(--accent)", color: "white" }}
          >
            {isExtracting ? "抽出中…" : "会話から抽出"}
          </button>
          <button
            onClick={() => setAddMode(!addMode)}
            className="py-2 px-4 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
          >
            手動追加
          </button>
        </div>

        {addMode && (
          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="記憶の内容…"
              rows={2}
              className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none mb-2"
              style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
            <div className="flex items-center gap-3">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                重要度: {newImportance}
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={newImportance}
                onChange={(e) => setNewImportance(parseInt(e.target.value))}
                className="flex-1"
              />
              <button
                onClick={handleAdd}
                disabled={!newContent.trim()}
                className="px-3 py-1 rounded text-sm disabled:opacity-40"
                style={{ backgroundColor: "var(--accent)", color: "white" }}
              >
                追加
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {memories.length === 0 && (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
              記憶がありません
            </p>
          )}
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              {editingId === memory.id ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded px-2 py-1 text-sm outline-none mb-2"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                  />
                  <div className="flex items-center gap-3">
                    <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      重要度: {editImportance}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={editImportance}
                      onChange={(e) => setEditImportance(parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: "var(--accent)", color: "white" }}
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 rounded text-xs"
                      style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-2">{memory.content}</p>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                    >
                      重要度 {memory.importance}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(memory)}
                        className="text-xs"
                        style={{ color: "var(--accent)" }}
                      >
                        編集
                      </button>
                      <button
                        onClick={() => setDeleteTarget(memory.id)}
                        className="text-xs"
                        style={{ color: "#dc2626" }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {deleteTarget !== null && (
        <ConfirmDialog
          message="この記憶を削除しますか？"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
