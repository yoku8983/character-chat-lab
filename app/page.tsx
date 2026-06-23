"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/Header";
import ChatView from "@/components/ChatView";
import ConvertView from "@/components/ConvertView";
import SessionSidebar from "@/components/SessionSidebar";
import MemoryPanel from "@/components/MemoryPanel";
import PersonaList from "@/components/PersonaList";
import PersonaEditor from "@/components/PersonaEditor";
import { MODELS } from "@/lib/models";
import { ChatMessage, Persona } from "@/lib/types";

interface PersonaSummary {
  id: string;
  name: string;
}

export default function Home() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [mode, setMode] = useState<"chat" | "convert" | "personas">("chat");
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [showMemory, setShowMemory] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const [editingPersona, setEditingPersona] = useState<Persona | undefined>(undefined);
  const [showEditor, setShowEditor] = useState(false);

  const refreshSidebar = useCallback(() => {
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const fetchPersonas = useCallback(() => {
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data: PersonaSummary[]) => {
        setPersonas(data);
        if (data.length > 0 && !data.find((p) => p.id === selectedPersona)) {
          setSelectedPersona(data[0].id);
        }
        setLoading(false);
      });
  }, [selectedPersona]);

  useEffect(() => {
    fetchPersonas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMemoryCount = useCallback(() => {
    if (!selectedPersona) return;
    fetch(`/api/memories?personaId=${encodeURIComponent(selectedPersona)}`)
      .then((res) => res.json())
      .then((data) => setMemoryCount(Array.isArray(data) ? data.length : 0));
  }, [selectedPersona]);

  useEffect(() => {
    fetchMemoryCount();
  }, [fetchMemoryCount]);

  const handlePersonaChange = (id: string) => {
    setSelectedPersona(id);
    setCurrentSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
  };

  const handleSessionCreated = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    refreshSidebar();
  };

  const handleMessagesUpdate = (messages: ChatMessage[]) => {
    chatMessagesRef.current = messages;
  };

  const handleModeChange = (newMode: "chat" | "convert" | "personas") => {
    setMode(newMode);
    setShowEditor(false);
    setEditingPersona(undefined);
  };

  const handleMemoryClose = () => {
    setShowMemory(false);
    fetchMemoryCount();
  };

  const handleEditPersona = (persona: Persona) => {
    setEditingPersona(persona);
    setShowEditor(true);
  };

  const handleCreatePersona = () => {
    setEditingPersona(undefined);
    setShowEditor(true);
  };

  const handlePersonaSaved = () => {
    setShowEditor(false);
    setEditingPersona(undefined);
    fetchPersonas();
  };

  const handlePersonaEditorCancel = () => {
    setShowEditor(false);
    setEditingPersona(undefined);
  };

  const currentPersonaName =
    personas.find((p) => p.id === selectedPersona)?.name ?? "";

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p style={{ color: "var(--text-secondary)" }}>読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        personas={personas}
        selectedPersona={selectedPersona}
        onPersonaChange={handlePersonaChange}
        models={MODELS}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        mode={mode}
        onModeChange={handleModeChange}
        onToggleMemory={() => setShowMemory((v) => !v)}
        memoryCount={memoryCount}
      />
      <div className="flex flex-1 overflow-hidden">
        {mode === "chat" && (
          <SessionSidebar
            personaId={selectedPersona}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            refreshKey={sidebarRefreshKey}
          />
        )}
        <main className="flex-1 overflow-hidden">
          {mode === "chat" ? (
            <ChatView
              key={`${selectedPersona}-${currentSessionId}`}
              personaId={selectedPersona}
              personaName={currentPersonaName}
              modelId={selectedModel}
              sessionId={currentSessionId}
              onSessionCreated={handleSessionCreated}
              onMessagesUpdate={handleMessagesUpdate}
            />
          ) : mode === "convert" ? (
            <ConvertView
              personaId={selectedPersona}
              personaName={currentPersonaName}
              modelId={selectedModel}
            />
          ) : mode === "personas" ? (
            showEditor ? (
              <PersonaEditor
                persona={editingPersona}
                onSave={handlePersonaSaved}
                onCancel={handlePersonaEditorCancel}
              />
            ) : (
              <PersonaList
                onEdit={handleEditPersona}
                onCreate={handleCreatePersona}
                onRefresh={fetchPersonas}
              />
            )
          ) : null}
        </main>
      </div>

      {showMemory && (
        <MemoryPanel
          personaId={selectedPersona}
          personaName={currentPersonaName}
          modelId={selectedModel}
          currentMessages={chatMessagesRef.current}
          sessionId={currentSessionId}
          onClose={handleMemoryClose}
        />
      )}
    </div>
  );
}
