"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OllamaStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusPill({ status, demo }: { status: OllamaStatus | null; demo: boolean }) {
  const live = Boolean(status?.running && status.defaultModel && !demo);

  let label = "Checking for Ollama…";
  let detail = "Looking for a local model on this machine.";
  if (status) {
    if (live) {
      label = "Local model ready";
      detail = `Ollama at ${status.host}. Your chats are summarised on this machine and never uploaded.`;
    } else if (status.running && status.defaultModel && demo) {
      label = "Demo mode (by choice)";
      detail = "Ollama is available, but you switched to demo mode. Flip the switch to use your local model.";
    } else if (status.running) {
      label = "Demo mode · no model pulled";
      detail = "Ollama is running but has no chat model. Run `ollama pull llama3.2`, then refresh.";
    } else {
      label = "Demo mode · Ollama offline";
      detail = "Start Ollama (`ollama serve`) and pull a model to get real digests. Demo digests are still fully offline.";
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-default items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              !status && "animate-pulse bg-muted-foreground/40",
              status && live && "bg-primary",
              status && !live && "bg-sun",
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-pretty">
        {detail}
      </TooltipContent>
    </Tooltip>
  );
}
