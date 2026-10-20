"use client";

import { FileText, Sparkles, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ParseError, parseChatExport } from "@/lib/parsers";
import { SAMPLES, sampleUrl } from "@/lib/samples";
import type { ParsedChat } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  chats: ParsedChat[];
  onAdd: (chats: ParsedChat[]) => void;
  onRemove: (id: string) => void;
  onSamples: () => void;
  loadingSamples: boolean;
}

function reportError(err: unknown, name?: string) {
  const msg = err instanceof ParseError ? err.message : "Something went wrong reading that export.";
  toast.error(name ? `${name}: ${msg}` : msg);
}

export function ChatIntake({ chats, onAdd, onRemove, onSamples, loadingSamples }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");

  async function readFiles(files: FileList | File[]) {
    const added: ParsedChat[] = [];
    for (const file of Array.from(files)) {
      if (/\.zip$/i.test(file.name)) {
        toast.error(`${file.name}: unzip it first and drop the .txt inside.`);
        continue;
      }
      try {
        added.push(...parseChatExport(await file.text(), { filename: file.name }));
      } catch (err) {
        reportError(err, file.name);
      }
    }
    if (added.length) onAdd(added);
  }

  function addPasted() {
    try {
      onAdd(parseChatExport(pasted));
      setPasted("");
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <div className="space-y-5">
      <Tabs defaultValue="upload">
        <TabsList className="bg-muted">
          <TabsTrigger value="upload">Drop files</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="pt-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void readFiles(e.dataTransfer.files);
            }}
            className={cn(
              "group flex w-full flex-col items-center gap-2 rounded-xl border border-dashed bg-background/60 px-6 py-9 text-center transition-colors",
              "hover:border-ring hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
              dragging && "border-ring bg-accent/60",
            )}
          >
            <Upload className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5" />
            <span className="text-sm font-medium">Drop last night&apos;s exports here</span>
            <span className="text-xs text-muted-foreground">
              WhatsApp <code className="font-mono">.txt</code> · Telegram <code className="font-mono">result.json</code>{" "}
              · as many as you like
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.json,text/plain,application/json"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void readFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </TabsContent>

        <TabsContent value="paste" className="space-y-2 pt-3">
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"19/10/2026, 23:41 - Rahul: Guys change of plans…\n\nor paste a Telegram JSON export"}
            className="min-h-36 resize-y bg-background/60 font-mono text-xs leading-relaxed"
          />
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" disabled={!pasted.trim()} onClick={addPasted}>
              Add this chat
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {chats.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-background/60">
          {chats.map((chat) => (
            <li key={chat.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {chat.platform === "whatsapp" ? "WhatsApp" : "Telegram"}
              </Badge>
              <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                {chat.messages.length.toLocaleString()} messages
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove ${chat.title}`}
                onClick={() => onRemove(chat.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">No export handy? Try three sample chats (524 messages).</span>
          <Button size="sm" variant="outline" onClick={onSamples} disabled={loadingSamples}>
            <Sparkles data-icon="inline-start" />
            Use sample chats
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Sample files:{" "}
        {SAMPLES.map((s, i) => (
          <span key={s.id}>
            <a className="underline-offset-4 hover:text-foreground hover:underline" href={sampleUrl(s.file)} download>
              {s.label}
            </a>
            {i < SAMPLES.length - 1 ? " · " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
