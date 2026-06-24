"use client";

import { useState, useEffect, useCallback } from "react";
import { Persona } from "@/lib/types";
import ConfirmDialog from "./ConfirmDialog";

interface PersonaListProps {
  onEdit: (persona: Persona) => void;
  onCreate: () => void;
  onRefresh: () => void;
}

interface PersonaSummaryWithSource {
  id: string;
  name: string;
  personality: string;
}

export default function PersonaList({ onEdit, onCreate, onRefresh }: PersonaListProps) {
  const [personas, setPersonas] = useState<PersonaSummaryWithSource[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/personas");
    const list = (await res.json()) as { id: string; name: string }[];
    const detailed = await Promise.all(
      list.map(async (p) => {
        const r = await fetch(`/api/personas/${p.id}`);
        const full = (await r.json()) as Persona;
        return {
          id: full.id,
          name: full.name,
          personality: full.identity.personality.slice(0, 80) + "…",
        };
      })
    );
    setPersonas(detailed);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/personas/${deleteTarget}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
    }
    setDeleteTarget(null);
    fetchAll();
    onRefresh();
  };

  const handleEditClick = async (id: string) => {
    const res = await fetch(`/api/personas/${id}`);
    const persona = (await res.json()) as Persona;
    onEdit(persona);
  };

  return (
    <div className="h-full overflow-y-auto px-4 md:px-8 py-4 md:py-8">
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-bold">ペルソナ管理</h2>
        <button
          onClick={onCreate}
          className="px-4 md:px-6 py-2 md:py-3 rounded-xl text-base md:text-lg font-medium transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "white" }}
        >
          + 新規作成
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {personas.map((p) => (
          <div
            key={p.id}
            className="rounded-xl p-4 md:p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-xl font-bold mb-2">{p.name}</h3>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {p.personality}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleEditClick(p.id)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
              >
                編集
              </button>
              <button
                onClick={() => setDeleteTarget(p.id)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          message="このペルソナを削除しますか？関連する記憶も削除されます。"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
