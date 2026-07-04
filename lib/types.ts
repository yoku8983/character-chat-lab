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

export interface Relationship {
  name: string;       // 相手の名前
  address_as: string; // 呼び方
  attitude: string;   // 態度・距離感
}

export interface Persona {
  id: string;
  name: string;
  identity: {
    personality: string;
    background: string;
    point_in_time?: string; // 物語上のどの時点のキャラか（時系列混在ハルシネーション防止）
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
  user_role?: string;             // ユーザーはキャラにとって誰か（例: プロデューサー）
  relationships?: Relationship[]; // 主要人物への呼び方・態度
  examples: { user: string; assistant: string }[];
  anti_examples?: { user: string; assistant: string }[];
}

export interface PersonaSummary {
  id: string;
  name: string;
  hasProfileImage: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
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
