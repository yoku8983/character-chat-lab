"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/lib/types";

interface ChatViewProps {
  personaId: string;
  personaName: string;
  modelId: string;
}

const CHINESE_MODEL_PREFIXES = ["deepseek/"];

export default function ChatView({ personaId, personaName, modelId }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const isChineseModel = CHINESE_MODEL_PREFIXES.some((p) => modelId.startsWith(p));
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([]);
  }, [personaId]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaId,
          modelId,
          messages: newMessages,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setMessages([
          ...newMessages,
          { role: "assistant", content: `エラー: ${error.error}` },
        ]);
        setIsStreaming(false);
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
        setMessages([
          ...newMessages,
          { role: "assistant", content: accumulated },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "エラー: 通信に失敗しました。" },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {isChineseModel && (
        <div className="px-8 py-2 text-center text-sm" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          このモデルは中国企業が提供しています。個人情報やセンシティブな情報を入力しないでください。
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-2xl" style={{ color: "var(--text-secondary)" }}>
              {personaName}に話しかけてみましょう
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-6 py-4 ${
                msg.role === "user" ? "rounded-br-md" : "rounded-bl-md"
              }`}
              style={{
                backgroundColor:
                  msg.role === "user"
                    ? "var(--user-bubble)"
                    : "var(--assistant-bubble)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              {msg.role === "assistant" && (
                <p className="text-base font-medium mb-2" style={{ color: "var(--accent-hover)" }}>
                  {personaName}
                </p>
              )}
              <p className="text-xl whitespace-pre-wrap leading-relaxed" style={{ color: msg.role === "user" ? "#ffffff" : undefined }}>
                {msg.content}
                {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-2.5 h-6 ml-0.5 animate-pulse" style={{ backgroundColor: "var(--accent-hover)" }} />
                )}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-8 py-5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex gap-4 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力… (Shift+Enterで改行)"
            rows={2}
            className="flex-1 resize-none rounded-xl px-5 py-4 text-xl outline-none placeholder-gray-500"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
            disabled={isStreaming}
          />
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !input.trim()}
            className="rounded-xl px-8 py-4 text-xl font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: "var(--accent)",
              color: "white",
            }}
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
