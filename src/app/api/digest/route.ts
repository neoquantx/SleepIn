import { demoDigest } from "@/lib/digest/demo";
import {
  buildChatTranscript,
  CHAT_SCHEMA,
  chatSystemPrompt,
  composeDigest,
  FEW_SHOT,
  hasEvidence,
  isGrounded,
  secondPerson,
  type ChatNotes,
} from "@/lib/digest/prompt";
import { getOllamaStatus, ollamaChatJson, pickModel } from "@/lib/ollama";
import type { Digest, DigestEvent, DigestItem, DigestRequest } from "@/lib/types";

export const maxDuration = 600;

const texts = (items: unknown): string[] =>
  (Array.isArray(items) ? items : [])
    .map((it) => (typeof it?.text === "string" ? it.text.trim() : ""))
    .filter(Boolean);

export async function POST(request: Request) {
  const started = Date.now();
  let body: DigestRequest;
  try {
    body = (await request.json()) as DigestRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const chats = (body.chats ?? []).filter((c) => Array.isArray(c.messages) && c.messages.length > 0);
  if (chats.length === 0) {
    return Response.json({ error: "No messages in the selected window. Try “Everything”." }, { status: 400 });
  }
  const meta = { messagesRead: chats.reduce((n, c) => n + c.messages.length, 0), chatsRead: chats.length };

  const demo = (note?: string): Digest => ({
    ...demoDigest({ ...body, chats }),
    ...meta,
    mode: "demo",
    durationMs: Date.now() - started,
    note,
  });

  if (body.forceDemo) return Response.json(demo());

  const status = await getOllamaStatus();
  if (!status.running) {
    return Response.json(demo(`Ollama isn't running at ${status.host}, so this is a demo digest.`));
  }
  const model = pickModel(status.models, body.model);
  if (!model) {
    return Response.json(demo("Ollama is running but has no models yet. Run `ollama pull llama3.2`."));
  }

  // Slow and steady: one chat per model call, so small models stay focused and every
  // item is attributed to the right chat. The digest is then assembled from the headlines.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: DigestEvent) => {
        if (request.signal.aborted) throw new Error("request was cancelled");
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const perChat: { importance: number; headline: string; matters: DigestItem[]; canWait: DigestItem[] }[] = [];
        const failed: string[] = [];

        for (const [index, chat] of chats.entries()) {
          send({ type: "progress", step: "chat", index, total: chats.length, chat: chat.title });
          const { transcript, numCtx } = buildChatTranscript(chat, body.userName);
          let notes: ChatNotes | null = null;
          // Small models occasionally ramble into invalid JSON; one retry usually lands.
          for (let attempt = 0; attempt < 2 && !notes; attempt++) {
            try {
              notes = await ollamaChatJson<ChatNotes>({
                model,
                system: chatSystemPrompt(body.userName),
                user: transcript,
                examples: FEW_SHOT,
                schema: CHAT_SCHEMA,
                numCtx,
                signal: request.signal,
              });
            } catch (err) {
              if (request.signal.aborted) throw err;
            }
          }
          if (!notes) {
            failed.push(chat.title);
            continue;
          }
          const clean = (items: string[]) =>
            items.filter((t) => isGrounded(t, transcript)).map((t) => secondPerson(t, body.userName));
          const [headline = ""] = clean([typeof notes.headline === "string" ? notes.headline.trim() : ""]);
          const rated = headline ? Math.max(0, Math.min(3, Math.round(Number(notes.importance) || 0))) : 0;
          const importance = hasEvidence(chat, body.userName) ? rated : Math.min(rated, 1);
          const matters = clean(texts(notes.matters)).slice(0, 2);
          const canWait = clean(texts(notes.can_wait)).slice(0, 2);
          // "Nice to know" chats don't earn a place in the two-line digest; their items can wait.
          const urgent = importance >= 2;
          perChat.push({
            importance,
            headline: urgent ? headline : "",
            matters: urgent ? matters.map((text) => ({ text, chat: chat.title })) : [],
            canWait: (urgent ? canWait : [...matters, ...canWait].slice(0, 2)).map((text) => ({ text, chat: chat.title })),
          });
        }

        if (perChat.length === 0) throw new Error("no chat could be read");

        send({ type: "progress", step: "digest", index: chats.length, total: chats.length });
        const ranked = [...perChat].sort((a, b) => b.importance - a.importance);

        send({
          type: "result",
          digest: {
            digest: composeDigest(ranked.map((c) => c.headline)),
            matters: ranked.flatMap((c) => c.matters).slice(0, 5),
            canWait: ranked.flatMap((c) => c.canWait).slice(0, 4),
            mode: "ollama",
            model,
            ...meta,
            durationMs: Date.now() - started,
            note: failed.length
              ? `${model} couldn't make sense of ${failed.join(", ")}, so ${failed.length === 1 ? "it was" : "they were"} skipped.`
              : undefined,
          },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        try {
          send({ type: "result", digest: demo(`${model} couldn't finish (${reason}). Showing a demo digest instead.`) });
        } catch {
          // Client already went away.
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Stream already closed by a disconnecting client.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
