"use client";

import { Copy, Hourglass, RotateCcw, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Digest, DigestItem } from "@/lib/types";

function seconds(ms: number) {
  return ms < 1000 ? "under a second" : `${Math.round(ms / 1000)}s`;
}

function ItemList({ items, empty, muted }: { items: DigestItem[]; empty: string; muted?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground italic">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="text-[0.95rem] leading-relaxed">
          <span className={muted ? "text-muted-foreground" : undefined}>{item.text}</span>
          {item.chat && <span className="mt-0.5 block text-xs text-muted-foreground/80">{item.chat}</span>}
        </li>
      ))}
    </ul>
  );
}

export function DigestView({ digest, onReset }: { digest: Digest; onReset: () => void }) {
  const [showDetails, setShowDetails] = useState(true);

  async function copy() {
    const lines = [
      digest.digest,
      ...(digest.matters.length ? ["", "What matters:", ...digest.matters.map((m) => `• ${m.text}`)] : []),
      ...(digest.canWait.length ? ["", "What can wait:", ...digest.canWait.map((m) => `• ${m.text}`)] : []),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied. Go make tea.");
  }

  return (
    <section className="animate-rise space-y-8" aria-live="polite">
      <div className="space-y-5">
        <p className="text-xs font-medium tracking-[0.18em] text-sun-foreground uppercase">Your morning digest</p>
        <blockquote className="font-serif text-[1.85rem] leading-[1.3] text-pretty sm:text-[2.15rem]">
          {digest.digest}
        </blockquote>
        <p className="text-sm text-muted-foreground">
          Read {digest.messagesRead.toLocaleString()} messages across {digest.chatsRead}{" "}
          {digest.chatsRead === 1 ? "chat" : "chats"} in {seconds(digest.durationMs)}
          {digest.mode === "ollama" ? (
            <>
              {" "}
              with <span className="font-mono text-[0.8rem] text-foreground/80">{digest.model}</span>, on this machine.
            </>
          ) : (
            <> in demo mode, on this machine.</>
          )}
        </p>
        {digest.note && (
          <p className="rounded-lg bg-accent/70 px-3 py-2 text-sm text-accent-foreground">{digest.note}</p>
        )}
      </div>

      {showDetails && (digest.matters.length > 0 || digest.canWait.length > 0) && (
        <>
          <Separator />
          <div className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Sun className="size-4 text-sun-foreground" /> What matters
              </h2>
              <ItemList items={digest.matters} empty="Honestly? Nothing." />
            </div>
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Hourglass className="size-4" /> What can wait
              </h2>
              <ItemList items={digest.canWait} empty="Nothing left over." muted />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button variant="outline" onClick={copy}>
          <Copy data-icon="inline-start" /> Copy digest
        </Button>
        <Button variant="ghost" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? "Just the two lines" : "What matters / what can wait"}
        </Button>
        <Button variant="ghost" className="ml-auto text-muted-foreground" onClick={onReset}>
          <RotateCcw data-icon="inline-start" /> Another morning
        </Button>
      </div>
    </section>
  );
}
