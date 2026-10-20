"use client";

import { Check, Coffee, Lock } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseChatExport, sliceToWindow, type CatchUpWindow } from "@/lib/parsers";
import { SAMPLE_USER_NAME, SAMPLES, sampleUrl } from "@/lib/samples";
import type { Digest, DigestEvent, DigestRequest, OllamaStatus, ParsedChat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChatIntake } from "./chat-intake";
import { DigestView } from "./digest-view";
import { StatusPill } from "./status-pill";

/** Keeps request bodies sane for huge exports; the prompt trims further anyway. */
const MAX_MESSAGES_PER_CHAT = 4000;

const READING_LINES = [
  "Reading {n} messages, slowly and steadily…",
  "Skipping the good-morning forwards…",
  "Politely ignoring the stickers…",
  "Working out which plans actually changed…",
  "Checking if anyone needs you specifically…",
  "Almost there. No rush, it's Sloth Day.",
];

const subscribeNoop = () => () => {};
function useToday() {
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      const now = new Date();
      const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      return `${date}|${now.getHours()}`;
    },
    () => null,
  );
}

function greeting(hour: number) {
  if (hour < 5) return "Up early? Go back to bed.";
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon. No judgement.";
  return "Good evening. Still catching up?";
}

export function MorningDigest() {
  const today = useToday();
  const [dateLabel, hour] = today ? today.split("|") : [null, "8"];

  const [chats, setChats] = useState<ParsedChat[]>([]);
  const [catchUp, setCatchUp] = useState<CatchUpWindow>("overnight");
  const [userName, setUserName] = useState("");
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [demoChoice, setDemoChoice] = useState(false);
  const [model, setModel] = useState<string | undefined>();
  const [phase, setPhase] = useState<"idle" | "reading" | "done">("idle");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [progress, setProgress] = useState<Extract<DigestEvent, { type: "progress" }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const next = (await (await fetch("/api/status", { cache: "no-store" })).json()) as OllamaStatus;
        if (cancelled) return;
        setStatus(next);
        // Keep polling until a model shows up, so starting Ollama mid-session just works.
        if (!next.running || !next.defaultModel) timer = setTimeout(check, 8000);
      } catch {
        if (!cancelled) timer = setTimeout(check, 8000);
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "reading") return;
    const id = setInterval(() => setLineIndex((i) => Math.min(i + 1, READING_LINES.length - 1)), 3200);
    return () => clearInterval(id);
  }, [phase]);

  const canUseModel = Boolean(status?.running && status.defaultModel);
  const demo = !canUseModel || demoChoice;
  const activeModel = model ?? status?.defaultModel ?? undefined;

  const windowed = useMemo(() => sliceToWindow(chats, catchUp), [chats, catchUp]);
  const windowCount = windowed.reduce((n, c) => n + c.messages.length, 0);

  async function loadSamples() {
    setLoadingSamples(true);
    try {
      const loaded = await Promise.all(
        SAMPLES.map(async (s) => {
          const text = await (await fetch(sampleUrl(s.file))).text();
          return parseChatExport(text, { filename: s.file, sampleId: s.id });
        }),
      );
      setChats((prev) => [...prev.filter((c) => !c.sampleId), ...loaded.flat()]);
      if (!userName) setUserName(SAMPLE_USER_NAME);
    } catch {
      toast.error("Couldn't load the sample chats.");
    } finally {
      setLoadingSamples(false);
    }
  }

  async function brew() {
    setPhase("reading");
    setLineIndex(0);
    const body: DigestRequest = {
      chats: windowed.map(({ title, platform, messages, sampleId }) => ({
        title,
        platform,
        sampleId,
        messages: messages.slice(-MAX_MESSAGES_PER_CHAT),
      })),
      userName: userName.trim() || undefined,
      model: activeModel,
      forceDemo: demo,
    };
    setProgress(null);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "The digest couldn't be made.");
      }

      let result: Digest | null = null;
      if (res.headers.get("content-type")?.includes("ndjson") && res.body) {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const event = JSON.parse(line) as DigestEvent;
            if (event.type === "progress") setProgress(event);
            else result = event.digest;
          }
        }
      } else {
        result = (await res.json()) as Digest;
      }
      if (!result) throw new Error("The digest stream ended early.");
      setDigest(result);
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The digest couldn't be made.");
      setPhase("idle");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pt-10 pb-12 sm:pt-14">
      <header className="mb-12 space-y-10">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="grid size-7 place-items-center rounded-full bg-sun/60 text-sun-foreground">
              <Coffee className="size-3.5" />
            </span>
            SleepIn
          </span>
          <StatusPill status={status} demo={demoChoice} />
        </div>
        <div className="space-y-3">
          <p className="h-4 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">{dateLabel}</p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">{greeting(Number(hour))}</h1>
          {phase !== "done" && (
            <p className="max-w-lg text-[1.05rem] leading-relaxed text-pretty text-muted-foreground">
              You slept through a few hundred messages. Drop in the chat exports and a model on this machine will
              read them for you, so you never scroll 500 messages again.
            </p>
          )}
        </div>
      </header>

      {phase === "done" && digest ? (
        <DigestView digest={digest} onReset={() => setPhase("idle")} />
      ) : phase === "reading" ? (
        <div className="animate-rise flex flex-col items-center gap-4 py-16 text-center" aria-live="polite">
          <span className="animate-sloth text-4xl" aria-hidden>
            🦥
          </span>
          <p className="font-serif text-xl">
            {READING_LINES[lineIndex].replace("{n}", windowCount.toLocaleString())}
          </p>
          <p className="text-sm text-muted-foreground">
            {demo ? "Demo mode" : `${activeModel} on this machine`} · nothing is being uploaded
          </p>
          {!demo && (
            <ol className="mt-4 w-full max-w-xs space-y-1.5 text-left text-sm">
              {[...windowed.filter((c) => c.messages.length > 0).map((c) => c.title), "Writing your digest"].map(
                (label, i, all) => {
                  const current = progress ? (progress.step === "digest" ? all.length - 1 : progress.index) : 0;
                  const state = i < current ? "done" : i === current ? "active" : "todo";
                  return (
                    <li
                      key={`${label}-${i}`}
                      className={cn(
                        "flex items-center gap-2.5 transition-colors",
                        state === "todo" && "text-muted-foreground/60",
                        state === "done" && "text-muted-foreground",
                      )}
                    >
                      {state === "done" ? (
                        <Check className="size-3.5 text-primary" />
                      ) : (
                        <span
                          className={cn(
                            "mx-[3px] size-2 rounded-full",
                            state === "active" ? "animate-pulse bg-sun-foreground" : "bg-border",
                          )}
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </li>
                  );
                },
              )}
            </ol>
          )}
        </div>
      ) : (
        <Card className="animate-rise gap-0 bg-card/80 py-0 shadow-[0_1px_0_0_var(--border),0_24px_60px_-40px_oklch(0.4_0.05_60/0.35)] backdrop-blur">
          <CardContent className="space-y-6 p-6 sm:p-7">
            <ChatIntake
              chats={chats}
              onAdd={(added) => setChats((prev) => [...prev, ...added])}
              onRemove={(id) => setChats((prev) => prev.filter((c) => c.id !== id))}
              onSamples={loadSamples}
              loadingSamples={loadingSamples}
            />

            <div className="grid gap-5 border-t pt-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Catch me up on</Label>
                <Tabs value={catchUp} onValueChange={(v) => setCatchUp(v as CatchUpWindow)}>
                  <TabsList className="w-full bg-muted">
                    <TabsTrigger value="overnight">Overnight</TabsTrigger>
                    <TabsTrigger value="day">24 hours</TabsTrigger>
                    <TabsTrigger value="all">Everything</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs text-muted-foreground">
                  Your name in these chats <span className="text-muted-foreground/70">(optional)</span>
                </Label>
                <Input
                  id="name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="So it knows who “you” are"
                  className="bg-background/60"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <label className="flex items-center gap-2.5">
                <Switch checked={!demo} disabled={!canUseModel} onCheckedChange={(on) => setDemoChoice(!on)} />
                <span className={canUseModel ? undefined : "text-muted-foreground"}>Use local model</span>
              </label>
              {canUseModel && !demoChoice && status && status.models.length > 1 && (
                <Select value={activeModel} onValueChange={setModel}>
                  <SelectTrigger size="sm" className="w-48 font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {status.models.map((m) => (
                      <SelectItem key={m} value={m} className="font-mono text-xs">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {canUseModel && !demoChoice && status?.models.length === 1 && (
                <span className="font-mono text-xs text-muted-foreground">{activeModel}</span>
              )}
              {!canUseModel && status && (
                <span className="text-xs text-muted-foreground">
                  {status.running ? "Run `ollama pull llama3.2` to enable" : "Start Ollama to enable"}
                </span>
              )}
            </div>

            <Button
              size="lg"
              className="h-11 w-full text-[0.95rem]"
              disabled={windowCount === 0}
              onClick={brew}
            >
              <Coffee data-icon="inline-start" />
              {chats.length === 0
                ? "Add a chat to brew your digest"
                : windowCount === 0
                  ? "No messages in this window"
                  : `Brew my digest · ${windowCount.toLocaleString()} messages`}
            </Button>
          </CardContent>
        </Card>
      )}

      <footer className="mt-auto pt-16 text-center text-xs leading-relaxed text-muted-foreground">
        <p className="mx-auto flex max-w-md items-start justify-center gap-2 text-pretty">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Nothing leaves this machine. Chats are parsed in your browser and summarised by an open-weight model via
            Ollama on localhost. No cloud APIs, no accounts, no analytics.
          </span>
        </p>
        <p className="mt-3 text-muted-foreground/70">
          Made slowly for International Sloth Day 🦥 · Hacktoberfest Open-Source AI Challenge, Week 3
        </p>
      </footer>
    </main>
  );
}
