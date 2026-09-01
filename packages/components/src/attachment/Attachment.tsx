'use client'

// Attachment - the drawing at 40:54: "Uploaded file row: type thumbnail,
// filename, metadata line, remove affordance, and a progress rail visible only
// while uploading. Error turns the border and metadata destructive. Meta text
// carries the size when complete and the failure reason on error."
//
// The hallmarks the drawing cannot express, owned here:
//   - the progress rail is a real progressbar (role, valuenow, valuemin/max),
//     so a screen reader hears the upload move
//   - remove is OUR Button (tertiary icon), not a pictogram - focus ring,
//     disabled and hover come from one file - and its aria-label names the
//     file, because a page of attachments saying "remove, remove, remove" is
//     unusable
//   - the error meta line is aria-live polite: a failure that arrives after
//     the user tabbed away still gets announced
import * as React from "react";
import { File as FileIcon, Trash2 } from "lucide-react";

import { Progress } from "../progress/Progress";
import { Button } from "../button/Button";
import { cn } from "../cn";

export type AttachmentState = "uploading" | "complete" | "error";

export type AttachmentProps = {
  filename: string;
  /** The size when complete, the failure reason on error - the drawing's rule. */
  meta?: React.ReactNode;
  state?: AttachmentState;
  /** 0..100; only rendered while uploading. Omit for an indeterminate rail. */
  progress?: number;
  /** 32px thumbnail slot; defaults to a file icon on the secondary surface. */
  thumb?: React.ReactNode;
  onRemove?: () => void;
  className?: string;
};

export function Attachment({
  filename,
  meta,
  state = "complete",
  progress,
  thumb,
  onRemove,
  className,
}: AttachmentProps) {
  return (
    <div
      data-state={state}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border bg-card px-3 py-2",
        state === "error" ? "border-destructive" : "border-border",
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
            size="iconXs"
            aria-label={`Remove ${filename}`}
            onClick={onRemove}
          >
            {/* A trash, not an X - an X reads as "close", this DELETES the file
                (Jacob, 2026-08-30). */}
            <Trash2 aria-hidden className="size-4" />
          </Button>
        )}
      </div>
      {state === "uploading" && (
        // The rail IS the Progress component now (Jacob, 2026-08-30) - one
        // bar, one set of aria, one animation. Height stays the drawing's 3px.
        // showValue puts the percentage in a fixed right-hand column so it
        // lines up under the remove button rather than floating.
        <Progress
          value={progress ?? 0}
          showValue
          aria-label={`Uploading ${filename}`}
        />
      )}
    </div>
  );
}
