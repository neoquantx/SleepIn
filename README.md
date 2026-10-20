# Group Chat Morning Digest 🦥

> Point it at last night's WhatsApp or Telegram export. A local open-weight model reads the hundreds of messages you slept through and hands you two lines:
>
> **"Rahul's birthday moved to Saturday, mom wants you to call, nothing else matters."**

![Morning digest generated locally by llama3.2 from 520 sample messages](docs/digest.png)

Built for the **Hacktoberfest Open-Source AI Challenge, Week 3: _Slow and Steady_** (International Sloth Day). The AI does the overnight catch-up, so the human gets to stay lazy.

- **Lazy payoff:** never scroll 500 messages again.
- **Why open:** your private chats stay 100% on your machine. Parsing happens in the browser, and summarising happens in a local Ollama model on `localhost`. There are no cloud APIs, no accounts, and no analytics. Next.js telemetry is disabled in the npm scripts, and fonts are bundled locally.

## What it does

1. **Drop or paste** one or more chat exports: WhatsApp `.txt` (Android and iOS formats) or Telegram `result.json` (single chat or full account export).
2. **Pick a window:** _Overnight_ (12h), _24 hours_, or _Everything_. The window is measured back from the newest message in your exports.
3. **Optionally tell it your name** as it appears in the chats, so "Dev??" from Mom counts as being about _you_.
4. **Brew.** A local model reads each chat in turn (slowly and steadily, with live progress), then you get:
   - a **2–3 line morning digest**, and
   - an optional **What matters / What can wait** breakdown, tagged by chat.

### How the summarising works

Small local models (3B) get confused by 500 interleaved messages, so the pipeline is deliberately slow and steady:

- **One model call per chat**, using Ollama's structured outputs (a JSON schema). Each call returns a short `headline`, an `importance` score from 0 to 3, the items that `matters`, and the items that `can_wait`. Because the code tags each item with its chat, items are never attributed to the wrong chat.
- **Guardrails for small models:**
  - two few-shot examples (a plan change, and a noisy housing-society chat where nothing matters);
  - a grounding check that drops items naming people or places that aren't in that chat;
  - an evidence gate: a chat can only reach the headline if it mentions you or contains plan-change or request language;
  - a `num_predict` cap, plus one retry per chat.
- The final sentence is assembled from the ranked headlines as `X, Y, nothing else matters.`

### Demo mode

If Ollama isn't running, or has no model pulled, the app still works:

- The **bundled sample chats** get a hand-written digest, so the demo reads like the real thing.
- **Your own chats** get a simple keyword-scored digest that looks for plan changes, requests, mentions of your name, dates, and money.
- The UI clearly labels this as **demo mode**, and you can also switch to it manually.

## Run it

### 1. Install Ollama and pull a model

```bash
# macOS (or download from https://ollama.com)
brew install ollama
brew services start ollama        # or: ollama serve

ollama pull llama3.2              # 2 GB, default; qwen2.5 / qwen3 / gemma3 also work
```

The app auto-detects installed models. It prefers `llama3.2`, then `qwen3`, `qwen2.5`, `gemma3`, and so on, and lets you pick from a dropdown when several are installed.

Optional environment variables (put them in `.env.local`):

| Variable       | Default                  | Purpose                      |
| -------------- | ------------------------ | ---------------------------- |
| `OLLAMA_HOST`  | `http://127.0.0.1:11434` | Where Ollama is listening    |
| `OLLAMA_MODEL` | `llama3.2`               | Preferred model family / tag |

### 2. Run the app

```bash
npm install
npm run dev
# open http://localhost:3000
```

Click **Use sample chats**, then **Brew my digest**. With `llama3.2` on an Apple-silicon laptop, the three samples (about 520 messages) take roughly 45–90 seconds. Slow and steady.

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`, and `npm run samples` (regenerates the sample exports deterministically).

## Exporting your chats

### WhatsApp (`.txt`)

- **iPhone:** open the chat → tap the group/contact name → **Export Chat** → **Without Media** → save to Files or AirDrop it to your computer. If you get a `.zip`, unzip it and use the `_chat.txt` inside.
- **Android:** open the chat → **⋮** → **More** → **Export chat** → **Without media** → save or share the `.txt` to your computer.

Both the Android (`19/10/2026, 23:41 - Name: …`) and iOS (`[19/10/26, 11:41:07 PM] Name: …`) formats are supported, including 12/24h times, DD/MM vs MM/DD (auto-detected), multi-line messages, media placeholders, and system notices.

### Telegram (`result.json`)

Chat export is available in **Telegram Desktop**, not in the mobile apps:

- **One chat:** open the chat → **⋮** → **Export chat history** → untick photos/videos/files → **Format: Machine-readable JSON** → **Export**. Use the `result.json` it creates.
- **Everything:** **Settings → Advanced → Export Telegram data** → tick the chats you want → **Machine-readable JSON**. The app splits the export into separate chats automatically.

## Sample chats

The demo exports live in [`public/samples/`](public/samples). They are generated by [`scripts/generate-samples.mjs`](scripts/generate-samples.mjs) and contain 524 messages in total:

| File                                    | Format              | What's buried in the noise                                   |
| --------------------------------------- | ------------------- | ------------------------------------------------------------ |
| `WhatsApp Chat - Rahul Bday Squad.txt`  | WhatsApp, iOS       | Rahul's birthday moved from Friday to Saturday, 8pm at Toit  |
| `WhatsApp Chat with Sharma Family.txt`  | WhatsApp, Android   | Mom wants you (Dev) to call before 11 about Nani's visit     |
| `telegram-lakeside-residents.json`      | Telegram JSON       | Nothing urgent: parking fights, a lost cat, a water notice   |

## Project layout

```
src/
  app/
    page.tsx                  # renders <MorningDigest />
    api/status/route.ts       # is Ollama up? which models?
    api/digest/route.ts       # per-chat model calls → NDJSON progress stream → digest
  components/digest/          # intake (upload/paste/samples), digest view, status pill
  components/ui/              # shadcn/ui
  lib/parsers/                # WhatsApp + Telegram parsers, catch-up window
  lib/digest/prompt.ts        # transcripts, prompts, few-shot, grounding, digest composer
  lib/digest/demo.ts          # demo-mode digests
  lib/ollama.ts               # tiny Ollama client (structured outputs)
scripts/generate-samples.mjs  # deterministic sample exports
```

## Stack

Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · Ollama (`llama3.2` by default; any open-weight chat model works).
