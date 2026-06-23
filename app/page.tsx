"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import ChatView from "@/components/ChatView";
import ConvertView from "@/components/ConvertView";
import { MODELS } from "@/lib/models";

interface PersonaSummary {
  id: string;
  name: string;
}

export default function Home() {
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [selectedPersona, setSelectedPersona] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [mode, setMode] = useState<"chat" | "convert">("chat");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data: PersonaSummary[]) => {
        setPersonas(data);
        if (data.length > 0) {
          setSelectedPersona(data[0].id);
        }
        setLoading(false);
      });
  }, []);

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
        onPersonaChange={setSelectedPersona}
        models={MODELS}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        mode={mode}
        onModeChange={setMode}
      />
      <main className="flex-1 overflow-hidden">
        {mode === "chat" ? (
          <ChatView
            key={selectedPersona}
            personaId={selectedPersona}
            personaName={currentPersonaName}
            modelId={selectedModel}
          />
        ) : (
          <ConvertView
            personaId={selectedPersona}
            personaName={currentPersonaName}
            modelId={selectedModel}
          />
        )}
      </main>
    </div>
  );
}
