'use client'

import * as React from "react";
import { Download, FileText } from "@dorado/icons";

import { Accordion } from "../accordion/Accordion";
import { Button } from "../button/Button";
import { cn } from "../cn";

export type PaperworkDocumentState = "available" | "generating" | "unavailable";

export type PaperworkDocument = {
  id: string;
  name: React.ReactNode;
  meta?: React.ReactNode;
  state: PaperworkDocumentState;
  onDownload?: () => void;
};

export type PaperworkProps = {
  documents: PaperworkDocument[];
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  className?: string;
};

const NAME_STYLES: Record<PaperworkDocumentState, string> = {
  available: "text-foreground",
  generating: "text-foreground",
  unavailable: "text-muted-foreground",
};

const META_STYLES: Record<PaperworkDocumentState, string> = {
  available: "text-muted-foreground",
  generating: "text-placeholder",
  unavailable: "text-foreground-disabled",
};

const ICON_STYLES: Record<PaperworkDocumentState, string> = {
  available: "text-muted-foreground",
  generating: "text-muted-foreground",
  unavailable: "text-foreground-disabled",
};

const META_FALLBACK: Partial<Record<PaperworkDocumentState, React.ReactNode>> = {
  generating: "Generating…",
  unavailable: "Not yet available",
};

function PaperworkRow({ doc }: { doc: PaperworkDocument }) {
  const { name, meta, state, onDownload } = doc;
  const metaText = state === "available" ? meta : META_FALLBACK[state];

  return (
    <li className="flex w-full items-center gap-xs px-sm py-xs">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary",
          ICON_STYLES[state]
        )}
      >
        <FileText aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-3xs">
        <span className={cn("truncate text-small font-medium", NAME_STYLES[state])}>{name}</span>
        {metaText != null && (
          <span className={cn("truncate text-micro", META_STYLES[state])}>{metaText}</span>
        )}
      </span>
      {state !== "unavailable" && (
        <Button
          variant="tertiary"
          size="iconSm"
          aria-label={typeof name === "string" ? `Download ${name}` : "Download"}
          disabled={state === "generating"}
          onClick={onDownload}
        >
          <Download aria-hidden />
        </Button>
      )}
    </li>
  );
}

export function Paperwork({ documents, open, onToggle, defaultOpen = true, className }: PaperworkProps) {
  const isEmpty = documents.length === 0;

  return (
    <Accordion
      label="Paperwork"
      trailing={isEmpty ? "None yet" : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
      chevron="leading"
      open={open}
      onToggle={onToggle}
      defaultOpen={defaultOpen}
      className={className}
    >
      {isEmpty ? (
        <div className="flex w-full flex-col items-center gap-xs px-lg py-xl text-center">
          <FileText aria-hidden className="size-8 text-muted-foreground" />
          <span className="text-small font-medium text-muted-foreground">No documents yet</span>
          <span className="text-micro text-placeholder">
            Your invoice and packing list appear here once the order is priced.
          </span>
        </div>
      ) : (
        <ul className="flex w-full flex-col divide-y divide-border py-2xs">
          {documents.map((doc) => (
            <PaperworkRow key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </Accordion>
  );
}
