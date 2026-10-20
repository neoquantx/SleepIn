import type { ChatMessage, DigestItem, DigestRequest } from "@/lib/types";

interface CannedDigest {
  /** Lower-case clause that slots into the combined digest sentence; null if the chat was pure noise. */
  clause: string | null;
  matters: DigestItem[];
  canWait: DigestItem[];
}

/** Hand-written digests for the bundled samples so demo mode reads like the real thing. */
const SAMPLE_DIGESTS: Record<string, CannedDigest> = {
  "rahul-bday": {
    clause: "Rahul's birthday moved to Saturday",
    matters: [{ text: "Rahul's birthday moved from Friday to Saturday, 8pm at Toit Indiranagar", from: "Rahul" }],
    canWait: [
      { text: "Ananya is sorting the gift and will share the split later" },
      { text: "~180 messages of Toit-vs-Arbor debate, memes and cricket" },
    ],
  },
  "sharma-family": {
    clause: "mom wants you to call",
    matters: [{ text: "Call Mom before 11am, she needs to fix dates for Nani's visit", from: "Mom" }],
    canWait: [
      { text: "Sunita Aunty shared a methi thepla recipe" },
      { text: "Chachaji's lemon-water forwards (Neha Didi says they're fake)" },
    ],
  },
  "lakeside-residents": {
    clause: null,
    matters: [],
    canWait: [
      { text: "Water tank cleaning Thursday 10am–2pm, store water Wednesday night" },
      { text: "Parking-slot argument, round three. Biscuit the cat was found." },
    ],
  },
};

const SIGNALS: [RegExp, number][] = [
  [/\b(call|ring) (me|mom|dad|back)\b|\bcall me\b/i, 6],
  [/\b(moved|postponed|rescheduled|cancel+ed|change of plans?|instead|pushed to)\b/i, 6],
  [/\b(urgent|asap|important|emergency|hospital|doctor)\b/i, 6],
  [/\b(deadline|due|pay|owe|transfer)\b|[₹$]\s?\d+|\brs\.?\s?\d+/i, 4],
  [/\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, 3],
  [/\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b/i, 2],
  [/\b(final|confirmed|decided|reminder|notice)\b/i, 2],
  [/\?$/, 1],
];

const NOISE = /^(\[media\].*|ok+|lol+|lmao+|haha\w*|good (morning|night).*|[\p{Extended_Pictographic}\s]+|\+1|agreed.*)$/iu;

function score(m: ChatMessage, me?: string): number {
  if (m.isMedia || NOISE.test(m.text.trim()) || m.text.startsWith("[forwarded")) return 0;
  let s = SIGNALS.reduce((acc, [re, w]) => (re.test(m.text) ? acc + w : acc), 0);
  if (me && new RegExp(`\\b${me.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(m.text)) s += 5;
  return s;
}

const clip = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** Keyword-scored stand-in for the model, used for non-sample chats when Ollama isn't available. */
function heuristicDigest(chat: DigestRequest["chats"][number], userName?: string): CannedDigest {
  const me = userName?.trim();
  const ranked = chat.messages
    .map((m, i) => ({ m, s: score(m, me), i }))
    .filter((x) => x.s >= 6 && x.m.sender.toLowerCase() !== me?.toLowerCase())
    .sort((a, b) => b.s - a.s || b.i - a.i)
    .slice(0, 2);

  const top = ranked[0]?.m;
  const media = chat.messages.filter((m) => m.isMedia).length;
  return {
    clause: top ? `${top.sender} in ${chat.title} says “${clip(top.text, 48)}”` : null,
    matters: ranked.map(({ m }) => ({ text: `${m.sender}: ${clip(m.text)}`, from: m.sender })),
    canWait: [
      {
        text: `${(chat.messages.length - ranked.length).toLocaleString()} other messages${media ? `, ${media} photos and stickers` : ""}`,
      },
    ],
  };
}

export function demoDigest(req: DigestRequest) {
  const parts = req.chats
    .filter((c) => c.messages.length > 0)
    .map((chat) => {
      const canned = chat.sampleId ? SAMPLE_DIGESTS[chat.sampleId] : undefined;
      const d = canned ?? heuristicDigest(chat, req.userName);
      const tag = (items: DigestItem[]) => items.map((it) => ({ ...it, chat: it.chat ?? chat.title }));
      return { ...d, matters: tag(d.matters), canWait: tag(d.canWait) };
    });

  const clauses = parts.map((p) => p.clause).filter((c): c is string => Boolean(c));
  const quiet = parts.length - clauses.length;
  let digest: string;
  if (clauses.length === 0) {
    digest = "Nothing needs you this morning. Go back to sleep, slowly.";
  } else if (clauses.length <= 2) {
    const joined = clauses.join(", ");
    digest = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}, nothing else matters.`;
  } else {
    digest = `${clauses.length} chats have something for you, ${quiet ? `${quiet} can wait` : "the rest is noise"}. Start with: ${clauses[0]}.`;
  }

  return {
    digest,
    matters: parts.flatMap((p) => p.matters).slice(0, 5),
    canWait: parts.flatMap((p) => p.canWait).slice(0, 4),
  };
}
