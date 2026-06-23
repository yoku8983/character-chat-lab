"use client";

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl px-8 py-6 max-w-md mx-4"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg text-base transition-colors"
            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)" }}
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg text-base transition-colors"
            style={{ backgroundColor: "#dc2626", color: "white" }}
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
