'use client'

import * as React from "react";
import { File as FileIcon, Trash2 } from "@dorado/icons";

import { Progress } from "../progress/Progress";
import { Button } from "../button/Button";
import { cn } from "../cn";

export type AttachmentState = "uploading" | "complete" | "error";

export type AttachmentProps = {
  filename: string;
  meta?: React.ReactNode;
  state?: AttachmentState;
  progress?: number;
  thumb?: React.ReactNode;
  onRemove?: () => void;
  bare?: boolean;
  className?: string;
};

export function Attachment({
  filename,
  meta,
  state = "complete",
  progress,
  thumb,
  onRemove,
  bare = false,
  className,
}: AttachmentProps) {
  return (
    <div
      data-state={state}
      className={cn(
        "flex w-full flex-col gap-2 px-3",
        bare
          ? "py-2.5"
          : cn("rounded-lg border bg-card py-2", state === "error" ? "border-destructive" : "border-border"),
        className
      )}
    >
      <div className="flex w-full items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary">
          {thumb ?? <FileIcon aria-hidden className="size-4 text-muted-foreground" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-small font-medium text-foreground">{filename}</span>
          {meta != null && (
            <span
              aria-live="polite"
              className={cn(
                "truncate text-micro",
                state === "error" ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {meta}
            </span>
          )}
        </span>
        {onRemove && (
          <Button
            variant="tertiary"
            size="iconSm"
            aria-label={`Remove ${filename}`}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {state === "uploading" && (
        <Progress
          value={progress ?? 0}
          showValue
          aria-label={`Uploading ${filename}`}
        />
      )}
    </div>
  );
}
