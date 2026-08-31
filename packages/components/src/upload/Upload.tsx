'use client'

// Upload - the dropzone Attachment pairs with. THERE IS NO DRAWING YET: Jacob
// asked for the component ("we're gonna need an Upload component to go along
// with Attachment") and the design side is being written back to the Figma in
// the same pass, in the library's own language - card surface split by a
// solid border (Jacob rejected the dash), a bare upload glyph with no box
// behind it, Small/Medium prompt over a
// Micro/Regular hint.
//
// The mechanics best practice demands and no drawing could say:
//   - the interactive element is a REAL <input type="file">, visually hidden
//     but focusable, wrapped in its <label>: click anywhere opens the picker,
//     keyboard focus lands on the input, and focus-within paints the system
//     ring on the surface
//   - drag-and-drop is progressive enhancement over that input, never a
//     replacement for it; the drag-over state escalates the border, the
//     library's one selection language
//   - drops are filtered against `accept` the same way the picker filters,
//     so drag cannot smuggle in what browse refuses
import * as React from "react";
import { CircleCheck, UploadCloud } from "lucide-react";
import { cn } from "../cn";

export type UploadProps = {
  /** Called with the chosen files - from the picker or a drop. */
  onFiles: (files: File[]) => void;
  /** Same syntax as the native attribute; also applied to drops. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  prompt?: React.ReactNode;
  hint?: React.ReactNode;
  /** Any icon from the library - 32px, muted (Jacob, 2026-08-30). */
  icon?: React.ReactNode;
  /** Files already accepted: check-in-success + count line; the zone stays a
   *  drop target for adding more. */
  uploadedCount?: number;
  className?: string;
};

function matchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept) return true;
  const rules = accept.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function Upload({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  prompt = "Drag & drop, or browse",
  hint,
  icon,
  uploadedCount,
  className,
}: UploadProps) {
  const uploaded = uploadedCount != null && uploadedCount > 0;
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => matchesAccept(f, accept));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <label
      data-drag-over={dragOver || undefined}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6 text-center transition-colors",
        dragOver ? "border-primary" : "border-border",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.currentTarget.files);
          // The same file chosen twice must fire twice - a rejected upload
          // retried is the common case, and a stale input value eats it.
          e.currentTarget.value = "";
        }}
      />
      {uploaded ? (
        <CircleCheck aria-hidden className="size-8 text-success" />
      ) : (
        <span className="text-muted-foreground [&_svg]:size-8">
          {icon ?? <UploadCloud aria-hidden className="size-8" />}
        </span>
      )}
      <span className="text-small font-medium text-foreground">
        {uploaded ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded` : prompt}
      </span>
      {uploaded ? (
        <span className="text-micro text-muted-foreground">Add more, or drag to replace</span>
      ) : (
        hint != null && <span className="text-micro text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}
