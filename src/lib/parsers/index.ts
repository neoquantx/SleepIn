import type { ChatMessage, ParsedChat } from "@/lib/types";
import { looksLikeTelegram, parseTelegram } from "./telegram";
import { looksLikeWhatsApp, parseWhatsApp, titleFromWhatsAppFilename } from "./whatsapp";

let counter = 0;
const makeId = () => `chat-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export class ParseError extends Error {}

/** Detects the export format from content (not extension) so pasted text works too. */
export function parseChatExport(
  raw: string,
  opts: { filename?: string; sampleId?: string } = {},
): ParsedChat[] {
  const text = raw.replace(/^\ufeff/, "").trim();
  if (!text) throw new ParseError("That file looks empty.");

  if (text.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ParseError("That looks like JSON, but it couldn't be read. Is the export complete?");
    }
    if (!looksLikeTelegram(data)) {
      throw new ParseError("This JSON doesn't look like a Telegram export (no messages found).");
    }
    const chats = parseTelegram(data, { makeId, sampleId: opts.sampleId });
    if (chats.length === 0) throw new ParseError("No readable messages in this Telegram export.");
    return chats;
  }

  if (looksLikeWhatsApp(text)) {
    const chat = parseWhatsApp(text, {
      id: makeId(),
      title: titleFromWhatsAppFilename(opts.filename) ?? undefined,
      sampleId: opts.sampleId,
    });
    if (chat.messages.length === 0) throw new ParseError("No readable messages in this WhatsApp export.");
    return [chat];
  }

  throw new ParseError(
    "Couldn't recognise this format. Use a WhatsApp .txt export or a Telegram result.json export.",
  );
}

export type CatchUpWindow = "overnight" | "day" | "all";

export const WINDOW_HOURS: Record<CatchUpWindow, number | null> = {
  overnight: 12,
  day: 24,
  all: null,
};

/**
 * Exports are snapshots, so "overnight" is measured back from the newest
 * message across all loaded chats rather than from the wall clock.
 */
export function sliceToWindow(chats: ParsedChat[], window: CatchUpWindow): ParsedChat[] {
  const hours = WINDOW_HOURS[window];
  if (hours === null) return chats;

  let latest = -Infinity;
  for (const c of chats) {
    for (const m of c.messages) {
      const t = m.timestamp ? Date.parse(m.timestamp) : NaN;
      if (t > latest) latest = t;
    }
  }
  if (latest === -Infinity) return chats;
  const cutoff = latest - hours * 3600_000;

  return chats.map((c) => ({
    ...c,
    messages: c.messages.filter((m: ChatMessage) => !m.timestamp || Date.parse(m.timestamp) >= cutoff),
  }));
}
