import type { ChatMessage, ParsedChat } from "@/lib/types";

type TelegramTextPart = string | { type?: string; text?: string };

interface TelegramMessage {
  type?: string;
  date?: string;
  from?: string | null;
  actor?: string;
  text?: string | TelegramTextPart[];
  photo?: string;
  file?: string;
  media_type?: string;
  sticker_emoji?: string;
  forwarded_from?: string;
  poll?: { question?: string };
}

interface TelegramChat {
  name?: string;
  type?: string;
  messages?: TelegramMessage[];
}

interface TelegramFullExport {
  chats?: { list?: TelegramChat[] };
}

function flattenText(text: TelegramMessage["text"]): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text.map((part) => (typeof part === "string" ? part : (part.text ?? ""))).join("");
}

function toMessage(m: TelegramMessage): ChatMessage | null {
  if (m.type && m.type !== "message") return null;
  const sender = (m.from ?? m.actor ?? "Unknown").trim() || "Unknown";
  let text = flattenText(m.text).trim();
  let isMedia = false;

  if (m.poll?.question) text = `[poll] ${m.poll.question}`;
  if (!text) {
    if (m.sticker_emoji) text = m.sticker_emoji;
    if (m.photo || m.file || m.media_type) {
      text = text ? `[media] ${text}` : "[media]";
      isMedia = true;
    }
  }
  if (!text) return null;
  if (m.forwarded_from) text = `[forwarded from ${m.forwarded_from}] ${text}`;

  return {
    timestamp: m.date ?? null,
    sender,
    text,
    isMedia: isMedia || undefined,
  };
}

function chatFromJson(
  chat: TelegramChat,
  opts: { id: string; title?: string; sampleId?: string },
): ParsedChat {
  const messages = (chat.messages ?? [])
    .map(toMessage)
    .filter((m): m is ChatMessage => m !== null);
  return {
    id: opts.id,
    platform: "telegram",
    title: chat.name?.trim() || opts.title || "Telegram chat",
    participants: [...new Set(messages.map((m) => m.sender))],
    messages,
    sampleId: opts.sampleId,
  };
}

export function looksLikeTelegram(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as TelegramChat & TelegramFullExport;
  return Array.isArray(d.messages) || Array.isArray(d.chats?.list);
}

/** Accepts a single-chat export (`result.json` from "Export chat history") or a full account export. */
export function parseTelegram(
  data: unknown,
  opts: { makeId: () => string; title?: string; sampleId?: string },
): ParsedChat[] {
  const d = data as TelegramChat & TelegramFullExport;
  if (Array.isArray(d.messages)) {
    return [chatFromJson(d, { id: opts.makeId(), title: opts.title, sampleId: opts.sampleId })];
  }
  return (d.chats?.list ?? [])
    .map((chat) => chatFromJson(chat, { id: opts.makeId() }))
    .filter((chat) => chat.messages.length > 0);
}
