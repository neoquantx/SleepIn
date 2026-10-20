import type { DigestRequest } from "@/lib/types";

type Chat = DigestRequest["chats"][number];

/** Roughly 10k tokens per chat; keeps small local models fast and inside their context. */
const MAX_CHAT_CHARS = 32_000;
const MAX_MESSAGE_CHARS = 280;

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short" });

function stamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `[${DAY.format(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}] `;
}

const who = (userName?: string) => userName?.trim() || "the user";

export function buildChatTranscript(chat: Chat, userName?: string) {
  const me = userName?.trim().toLowerCase();
  const lines = chat.messages
    .filter((m) => !m.isMedia)
    .map((m) => {
      const sender = me && m.sender.toLowerCase() === me ? `${m.sender} (you)` : m.sender;
      return `${stamp(m.timestamp)}${sender}: ${m.text.replace(/\s+/g, " ").slice(0, MAX_MESSAGE_CHARS)}`;
    });

  // Keep the newest messages when a chat is too long: they're the ones that override older plans.
  let kept = lines;
  let size = lines.reduce((n, l) => n + l.length + 1, 0);
  if (size > MAX_CHAT_CHARS) {
    let start = 0;
    while (size > MAX_CHAT_CHARS && start < lines.length - 20) size -= lines[start++].length + 1;
    kept = lines.slice(start);
  }

  const media = chat.messages.length - lines.length;
  const trimmed = lines.length - kept.length;
  const header =
    `Chat: "${chat.title}" (${chat.platform === "whatsapp" ? "WhatsApp" : "Telegram"} group, ` +
    `${chat.messages.length} messages${media ? `, ${media} photos/stickers not shown` : ""}` +
    `${trimmed ? `, ${trimmed} older messages trimmed` : ""})`;
  const transcript = [header, "", ...kept].join("\n");
  return { transcript, numCtx: Math.min(32_768, Math.max(4096, Math.ceil(transcript.length / 3) + 1024)) };
}

export function chatSystemPrompt(userName?: string) {
  const name = who(userName);
  return `You read one group chat that ${name} slept through and pick out only what affects ${name}. Messages that mention ${name} by name are probably for them.

Return JSON:
- "headline": the single most important thing in this chat as a short casual clause, max 8 words, no full stop, written for ${name} ("you"), starting with who it's about (e.g. "Priya's dinner moved to Friday", "dad wants you to call"). Empty string "" if nothing matters.
- "importance": 0 = nothing for ${name}, 1 = nice to know, 2 = a plan ${name} is part of changed, 3 = someone is waiting on ${name}. Lost & found, complaints, deliveries, arguments between other people and general notices are 0 or 1 unless they name ${name}.
- "matters": 0–2 items that need ${name}'s attention. Only: plan changes (give the NEW day, time and place), direct requests to ${name}, deadlines, money, health or family. One short line each, max 14 words, in your own words.
- "can_wait": 1–2 items summarising the low-priority rest in a few words.

Rules: rewrite in your own words, never copy messages. A later message overrides an earlier plan. Questions between other people are not requests to ${name}. Ignore greetings, memes, stickers, jokes and forwards. Only use names, times and places that appear in THIS chat. Most chats contain nothing important: then use "" and importance 0.`;
}

/** Two worked examples as prior turns: one with a real plan change, one that is pure noise. */
export const FEW_SHOT: { role: "user" | "assistant"; content: string }[] = [
  {
    role: "user",
    content: `Chat: "Climbing Crew" (WhatsApp group, 6 messages)

[Fri 22:10] Zoltan: session is friday at boulder hub
[Fri 23:30] Zoltan: change of plans, moving it to sunday instead
[Fri 23:31] Ines: sunday works, 6pm?
[Fri 23:40] Zoltan: yes sunday 6pm at boulder hub, final
[Fri 23:45] Ines: lol that video
[Fri 23:46] Ines: who has spare chalk`,
  },
  {
    role: "assistant",
    content: JSON.stringify({
      headline: "Zoltan's climbing session moved to Sunday",
      importance: 2,
      matters: [{ text: "Climbing moved to Sunday 6pm at Boulder Hub" }],
      can_wait: [{ text: "Ines hunting for spare chalk" }],
    }),
  },
  {
    role: "user",
    content: `Chat: "Maple Court Residents" (Telegram group, 7 messages)

[Sat 20:02] Pradeep (D-12): Whose bike is blocking gate 2?? Third time this week
[Sat 20:05] Wen: Lost & found: car keys near the pool, collect from security
[Sat 20:06] Maple Court Office: Notice: lift maintenance on Wednesday, 9am–1pm
[Sat 20:40] Security Gate: Zomato delivery for D-12 at gate
[Sat 21:10] Pradeep (D-12): Please follow the rules people
[Sat 21:30] Wen: +1
[Sat 21:31] Wen: good night all`,
  },
  {
    role: "assistant",
    content: JSON.stringify({
      headline: "",
      importance: 0,
      matters: [],
      can_wait: [{ text: "Maple Court lift maintenance Wednesday" }, { text: "Pradeep's parking complaints" }],
    }),
  },
];

const STRONG_SIGNAL =
  /\b(moved|postponed|rescheduled|cancel+ed|change of plans?|instead|call me|call (her|him|mom|dad|back)|urgent|asap|emergency|hospital|deadline|owe[sd]?)\b/i;

/**
 * Small models over-rate busy chats. A chat may only reach the headline if it names the reader
 * or contains plan-change / request language somewhere.
 */
export function hasEvidence(chat: Chat, userName?: string): boolean {
  const name = userName?.trim();
  const mention = name ? new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i") : null;
  return chat.messages.some(
    (m) =>
      !m.isMedia &&
      (STRONG_SIGNAL.test(m.text) || (mention !== null && m.sender.toLowerCase() !== name!.toLowerCase() && mention.test(m.text))),
  );
}

const STOP = new Set(["you", "your", "the", "and", "for", "nothing", "everyone", "someone", "group", "chat"]);

/** Rejects items that mention capitalised names absent from the chat, the usual small-model hallucination. */
export function isGrounded(text: string, transcript: string): boolean {
  const haystack = transcript.toLowerCase();
  const words = text.match(/\b[A-Z][\p{L}']{2,}/gu) ?? [];
  return words
    .map((w) => w.replace(/'s$/i, "").toLowerCase())
    .filter((w) => !STOP.has(w))
    .every((w) => haystack.includes(w));
}

/** Small models often refer to the reader in the third person ("call Dev"); turn that back into "you". */
export function secondPerson(text: string, userName?: string): string {
  const name = userName?.trim();
  if (!name) return text;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}'s\\b`, "g"), "your").replace(new RegExp(`\\b${escaped}\\b`, "g"), "you");
}

/** Joins per-chat headlines into the digest, mirroring "X moved to Saturday, mom wants you to call, nothing else matters." */
export function composeDigest(headlines: string[]): string {
  const clauses = headlines.map((h) => h.trim().replace(/[.!\s]+$/, "")).filter(Boolean);
  if (clauses.length === 0) return "Nothing needs you this morning. Go back to sleep, slowly.";
  const shown = clauses.slice(0, 3);
  const joined = shown.join(", ");
  const tail = clauses.length > shown.length ? ", and a little more below." : ", nothing else matters.";
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${tail}`;
}

const ITEMS = {
  type: "array",
  items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
} as const;

export const CHAT_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    importance: { type: "integer", minimum: 0, maximum: 3 },
    matters: ITEMS,
    can_wait: ITEMS,
  },
  required: ["headline", "importance", "matters", "can_wait"],
} as const;

export interface ChatNotes {
  headline?: unknown;
  importance?: unknown;
  matters?: { text?: unknown }[];
  can_wait?: { text?: unknown }[];
}
