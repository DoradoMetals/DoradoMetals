import * as React from "react";
import { Check, Clock, Ellipsis, TriangleAlert } from "lucide-react";
import { cn } from "../cn";

export type TrackerStepState = "complete" | "current" | "upcoming" | "exception";

export type TrackerStepData = {
  label: React.ReactNode;
  location?: React.ReactNode;
  timestamp?: React.ReactNode;
  state: TrackerStepState;
};

export type TrackerProps = {
  steps: TrackerStepData[];
  trackingNumber?: React.ReactNode;
  etaLabel?: React.ReactNode;
  eta?: React.ReactNode;
  header?: boolean;
  className?: string;
};

const NODE_ICON = {
  complete: Check,
  current: Ellipsis,
  upcoming: Clock,
  exception: TriangleAlert,
} as const;

const NODE_STYLES: Record<TrackerStepState, string> = {
  complete: "bg-primary text-primary-foreground",
  current: "bg-primary text-primary-foreground",
  upcoming: "border border-border-strong bg-muted text-muted-foreground",
  exception: "bg-destructive text-destructive-foreground",
};

const CONNECTOR_STYLES: Record<TrackerStepState, string> = {
  complete: "bg-primary",
  current: "bg-border-strong",
  upcoming: "bg-border-strong",
  exception: "bg-destructive",
};

const LABEL_STYLES: Record<TrackerStepState, string> = {
  complete: "text-foreground",
  current: "text-foreground",
  upcoming: "text-muted-foreground",
  exception: "text-destructive",
};

const META_STYLES: Record<TrackerStepState, string> = {
  complete: "text-muted-foreground",
  current: "text-muted-foreground",
  upcoming: "text-placeholder",
  exception: "text-muted-foreground",
};

const NODE_GLYPH_STROKE_WIDTH = (2 * 14) / 24;

function TrackerNode({ state }: { state: TrackerStepState }) {
  const Icon = NODE_ICON[state];
  return (
    <span
      aria-hidden
      className={cn("flex size-6 shrink-0 items-center justify-center rounded-xl", NODE_STYLES[state])}
    >
      <Icon className="size-3.5" strokeWidth={NODE_GLYPH_STROKE_WIDTH} />
    </span>
  );
}

function TrackerRow({ step, connector }: { step: TrackerStepData; connector: boolean }) {
  const { label, state } = step;
  const isUpcoming = state === "upcoming";
  const location = isUpcoming ? (step.location ?? "Pending") : step.location;
  const timestamp = isUpcoming ? "—" : step.timestamp;

  return (
    <li aria-current={state === "current" ? "step" : undefined} className="flex w-full items-start gap-sm">
      <span className="flex shrink-0 flex-col items-center gap-2xs self-stretch">
        <TrackerNode state={state} />
        {connector && <span aria-hidden className={cn("w-0.5 min-h-px flex-1", CONNECTOR_STYLES[state])} />}
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col gap-3xs", connector && "pb-lg")}>
        <span className={cn("w-full text-small font-medium", LABEL_STYLES[state])}>{label}</span>
        {location != null && <span className={cn("w-full text-micro", META_STYLES[state])}>{location}</span>}
      </span>
      {timestamp != null && (
        <span className={cn("shrink-0 whitespace-nowrap text-right text-micro", META_STYLES[state])}>
          {timestamp}
        </span>
      )}
    </li>
  );
}

export function Tracker({
  steps,
  trackingNumber,
  etaLabel = "ETA",
  eta,
  header = true,
  className,
}: TrackerProps) {
  return (
    <div className={cn("flex w-full flex-col gap-md rounded-lg border border-border bg-card p-md", className)}>
      {header && (trackingNumber != null || eta != null) && (
        <div className="flex w-full items-start justify-between">
          {trackingNumber != null && (
            <span className="flex flex-col gap-3xs">
              <span className="text-micro text-muted-foreground">Tracking #</span>
              <span className="text-small font-medium text-foreground">{trackingNumber}</span>
            </span>
          )}
          {eta != null && (
            <span className="flex flex-col items-end gap-3xs text-right">
              <span className="text-micro text-muted-foreground">{etaLabel}</span>
              <span className="text-small font-medium text-foreground">{eta}</span>
            </span>
          )}
        </div>
      )}
      <ol aria-label="Shipment timeline" className="flex w-full flex-col items-start">
        {steps.map((step, i) => (
          <TrackerRow key={i} step={step} connector={i < steps.length - 1} />
        ))}
      </ol>
    </div>
  );
}
