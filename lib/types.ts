export interface SpeakingStyle {
  first_person: string;
  tone: string;
  sentence_endings: string[];
  catchphrases: string[];
  vocabulary_notes: string;
}

export interface KnowledgeDomain {
  topic: string;
  content: string;
}

export interface Persona {
  id: string;
  name: string;
  identity: {
    personality: string;
    background: string;
    speaking_style: SpeakingStyle;
  };
  knowledge: {
    domains: KnowledgeDomain[];
  };
  memory: {
    type: string;
    entries: string[];
  };
  behavior: {
    constraints: string[];
  };
  examples: { user: string; assistant: string }[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
}

export interface Session {
  id: string;
  personaId: string;
  modelId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface Memory {
  id: number;
  personaId: string;
  content: string;
  importance: number;
  sourceSessionId?: string;
  createdAt: string;
}
