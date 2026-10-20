import type { ChatMessage, ParsedChat } from "@/lib/types";

// Matches both Android ("19/10/2026, 21:14 - Rahul: hi") and iOS
// ("[19/10/26, 9:14:03 PM] Rahul: hi") export headers, including the
// narrow no-break space WhatsApp puts before AM/PM.
const HEADER =
  /^[\u200e\u200f]?\[?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?[\s\u202f]*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s*)?(.*)$/;

const INVISIBLE = /[\u200e\u200f\u202a-\u202e\ufeff]/g;

const MEDIA_PATTERNS = [
  /^<media omitted>$/i,
  /^<attached: .+>$/i,
  /^(image|video|audio|sticker|gif|document|contact card) omitted$/i,
  /^.+\.(jpg|jpeg|png|webp|opus|mp4|pdf|vcf) \(file attached\)$/i,
];

const DELETED = /^(this message was deleted|you deleted this message)$/i;

type DateOrder = "dmy" | "mdy" | "ymd";

interface RawHeader {
  a: number;
  b: number;
  c: number;
  hour: number;
  minute: number;
  second: number;
  meridiem?: string;
  rest: string;
}

function readHeader(line: string): RawHeader | null {
  const m = HEADER.exec(line);
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    c: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    meridiem: m[7]?.replace(/[.\s]/g, "").toLowerCase(),
    rest: m[8] ?? "",
  };
}

function detectOrder(headers: RawHeader[]): DateOrder {
  if (headers.some((h) => h.a > 31)) return "ymd";
  if (headers.some((h) => h.a > 12)) return "dmy";
  if (headers.some((h) => h.b > 12)) return "mdy";
  return "dmy";
}

function toIso(h: RawHeader, order: DateOrder): string | null {
  let day: number, month: number, year: number;
  if (order === "ymd") [year, month, day] = [h.a, h.b, h.c];
  else if (order === "mdy") [month, day, year] = [h.a, h.b, h.c];
  else [day, month, year] = [h.a, h.b, h.c];
  if (year < 100) year += 2000;

  let hour = h.hour;
  if (h.meridiem === "pm" && hour < 12) hour += 12;
  if (h.meridiem === "am" && hour === 12) hour = 0;

  const date = new Date(year, month - 1, day, hour, h.minute, h.second);
  if (Number.isNaN(date.getTime())) return null;
  return toLocalIso(date);
}

export function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function cleanText(raw: string): { text: string; isMedia: boolean } | null {
  // iOS exports prefix both media placeholders and system notices with U+200E.
  const marked = raw.startsWith("\u200e");
  const text = raw
    .replace(INVISIBLE, "")
    .replace(/\s*<This message was edited>$/i, "")
    .trim();
  if (!text || DELETED.test(text)) return null;
  if (MEDIA_PATTERNS.some((p) => p.test(text))) {
    return { text: "[media]", isMedia: true };
  }
  if (marked || /^messages and calls are end-to-end encrypted/i.test(text)) return null;
  return { text, isMedia: false };
}

export function looksLikeWhatsApp(raw: string): boolean {
  const lines = raw.split(/\r?\n/).slice(0, 40);
  return lines.filter((l) => readHeader(l)?.rest.includes(": ")).length >= 2;
}

export function titleFromWhatsAppFilename(filename?: string): string | null {
  if (!filename) return null;
  const base = filename.replace(/\.(txt|zip)$/i, "");
  const m = /^WhatsApp Chat (?:with|-)\s*(.+)$/i.exec(base);
  return (m ? m[1] : base).trim() || null;
}

export function parseWhatsApp(
  raw: string,
  opts: { id: string; title?: string; sampleId?: string },
): ParsedChat {
  const lines = raw.split(/\r?\n/);

  const entries: { header: RawHeader; body: string[] }[] = [];
  for (const line of lines) {
    const header = readHeader(line);
    if (header) {
      entries.push({ header, body: [header.rest] });
    } else if (entries.length > 0) {
      entries[entries.length - 1].body.push(line);
    }
  }

  const order = detectOrder(entries.map((e) => e.header));
  const messages: ChatMessage[] = [];
  const participants = new Set<string>();

  for (const { header, body } of entries) {
    const full = body.join("\n");
    const sep = full.indexOf(": ");
    // Lines without "Name: " are system notices (joins, encryption banner, subject changes).
    if (sep <= 0 || sep > 60) continue;
    const sender = full.slice(0, sep).replace(INVISIBLE, "").trim();
    const cleaned = cleanText(full.slice(sep + 2));
    if (!cleaned) continue;
    participants.add(sender);
    messages.push({
      timestamp: toIso(header, order),
      sender,
      text: cleaned.text,
      isMedia: cleaned.isMedia || undefined,
    });
  }

  return {
    id: opts.id,
    platform: "whatsapp",
    title: opts.title ?? "WhatsApp chat",
    participants: [...participants],
    messages,
    sampleId: opts.sampleId,
  };
}
