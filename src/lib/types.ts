export type Platform = "whatsapp" | "telegram";

export interface ChatMessage {
  /** ISO timestamp in local time, or null when the export line had no parsable date. */
  timestamp: string | null;
  sender: string;
  text: string;
  isMedia?: boolean;
}

export interface ParsedChat {
  id: string;
  platform: Platform;
  title: string;
  participants: string[];
  messages: ChatMessage[];
  /** Set for the bundled demo chats so demo mode can return a hand-written digest. */
  sampleId?: string;
}

export interface DigestItem {
  text: string;
  chat?: string;
  from?: string;
}

export interface Digest {
  digest: string;
  matters: DigestItem[];
  canWait: DigestItem[];
  mode: "ollama" | "demo";
  model?: string;
  messagesRead: number;
  chatsRead: number;
  durationMs: number;
  note?: string;
}

/** NDJSON events streamed by /api/digest while a local model works through the chats. */
export type DigestEvent =
  | { type: "progress"; step: "chat" | "digest"; index: number; total: number; chat?: string }
  | { type: "result"; digest: Digest };

export interface DigestRequest {
  chats: Pick<ParsedChat, "title" | "platform" | "messages" | "sampleId">[];
  userName?: string;
  model?: string;
  forceDemo?: boolean;
}

export interface OllamaStatus {
  running: boolean;
  host: string;
  models: string[];
  defaultModel: string | null;
}
