"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "@/lib/types";
import PersonaAvatar from "./PersonaAvatar";

const CHINESE_MODEL_PREFIXES = ["deepseek/"];

interface ChatViewProps {
  personaId: string;
  personaName: string;
  personaHasProfileImage: boolean;
  modelId: string;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  onMessagesUpdate?: (messages: ChatMessage[]) => void;
}

function formatTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface MessageGroup {
  role: "user" | "assistant";
  messages: ChatMessage[];
  time: string;
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === msg.role) {
      last.messages.push(msg);
      if (msg.createdAt) last.time = formatTime(msg.createdAt);
    } else {
      groups.push({
        role: msg.role,
        messages: [msg],
        time: formatTime(msg.createdAt),
      });
    }
  }
  return groups;
}

export default function ChatView({
  personaId,
  personaName,
  personaHasProfileImage,
  modelId,
  sessionId,
  onSessionCreated,
  onMessagesUpdate,
}: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(sessionId);
  const isChineseModel = CHINESE_MODEL_PREFIXES.some((p) => modelId.startsWith(p));

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  const loadSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId, loadSession]);

  const persistMessage = async (sid: string, role: string, content: string) => {
    await fetch(`/api/sessions/${sid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  };

  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, modelId }),
    });
    const session = await res.json();
    sessionRef.current = session.id;
    return session.id;
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const sid = await ensureSession();
    await persistMessage(sid, "user", trimmed);

    setMessages([...newMessages, { role: "assistant", content: "" }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId, modelId, messages: newMessages, sessionId: sid }),
      });

      if (!response.ok) {
        const error = await response.json();
        const errMsg = `エラー: ${error.error}`;
        setMessages([...newMessages, { role: "assistant", content: errMsg }]);
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
        setMessages([...newMessages, { role: "assistant", content: accumulated }]);
      }

      await persistMessage(sid, "assistant", accumulated);
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "エラー: 通信に失敗しました。" },
      ]);
    } finally {
      setIsStreaming(false);
      onSessionCreated(sid);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const groups = groupMessages(messages);
  const lastMsg = messages[messages.length - 1];
  const isStreamingLast = isStreaming && lastMsg?.role === "assistant";

  return (
    <div className="flex flex-col h-full">
      {isChineseModel && (
        <div className="px-3 md:px-8 py-2 text-center text-xs md:text-sm" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          このモデルは中国企業が提供しています。個人情報やセンシティブな情報を入力しないでください。
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6"
        style={{ backgroundColor: "var(--chat-bg)" }}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-lg md:text-2xl font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
              {personaName}に話しかけてみましょう
            </p>
          </div>
        )}
        <div className="space-y-3 md:space-y-4">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.role === "assistant" ? (
                <div className="flex items-start gap-2 md:gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <PersonaAvatar personaId={personaId} hasProfileImage={personaHasProfileImage} />
                  </div>
                  <div className="flex flex-col min-w-0 max-w-[80%] md:max-w-[65%]">
                    <p className="text-xs md:text-sm font-medium mb-1 pl-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                      {personaName}
                    </p>
                    <div className="space-y-0.5">
                      {group.messages.map((msg, mi) => {
                        const isFirst = mi === 0;
                        const isGroupLastMsg = mi === group.messages.length - 1;
                        const isVeryLast = gi === groups.length - 1 && isGroupLastMsg;
                        return (
                          <div key={mi} className="flex items-end gap-1.5">
                            <div
                              className={`rounded-xl px-3 md:px-4 py-2 md:py-3 ${isFirst ? "bubble-assistant rounded-tl-md" : ""}`}
                              style={{
                                backgroundColor: "var(--assistant-bubble)",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                              }}
                            >
                              <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                                {msg.content}
                                {isVeryLast && isStreamingLast && (
                                  <span className="inline-block w-2 h-5 ml-0.5 animate-pulse" style={{ backgroundColor: "var(--accent-hover)" }} />
                                )}
                              </p>
                            </div>
                            {isGroupLastMsg && group.time && (
                              <span className="text-[10px] md:text-xs flex-shrink-0 pb-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                                {group.time}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end">
                  <div className="space-y-0.5 max-w-[80%] md:max-w-[65%]">
                    {group.messages.map((msg, mi) => {
                      const isFirst = mi === 0;
                      const isGroupLastMsg = mi === group.messages.length - 1;
                      return (
                        <div key={mi} className="flex items-end justify-end gap-1.5">
                          {isGroupLastMsg && group.time && (
                            <span className="text-[10px] md:text-xs flex-shrink-0 pb-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                              {group.time}
                            </span>
                          )}
                          <div
                            className={`rounded-xl px-3 md:px-4 py-2 md:py-3 ${isFirst ? "bubble-user rounded-tr-md" : ""}`}
                            style={{
                              backgroundColor: "var(--user-bubble)",
                            }}
                          >
                            <p className="text-sm md:text-base whitespace-pre-wrap leading-relaxed text-white">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 md:px-8 py-3 md:py-4" style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--bg-secondary)" }}>
        <div className="flex gap-2 md:gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力…"
            rows={1}
            className="flex-1 resize-none rounded-full px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base outline-none placeholder-gray-400"
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
            className="rounded-full w-10 h-10 md:w-11 md:h-11 flex items-center justify-center transition-colors disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: "var(--accent)", color: "white" }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
