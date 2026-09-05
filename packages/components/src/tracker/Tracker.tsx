import * as React from "react";
import { Check, Clock, Ellipsis, TriangleAlert } from "@dorado/icons";
import { cn } from "../cn";

export type TrackerStepState = "complete" | "current" | "upcoming" | "exception";

export type TrackerStepData = {
  label: React.ReactNode;
  location?: React.ReactNode;
  timestamp?: React.ReactNode;
  state: TrackerStepState;
};

export type TrackerOrientation = "vertical" | "horizontal";

export type TrackerProps = {
  steps: TrackerStepData[];
  trackingNumber?: React.ReactNode;
  etaLabel?: React.ReactNode;
  eta?: React.ReactNode;
  header?: boolean;
  orientation?: TrackerOrientation;
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

function resolveStepText(step: TrackerStepData) {
  const isUpcoming = step.state === "upcoming";
  return {
    location: isUpcoming ? (step.location ?? "Pending") : step.location,
    timestamp: isUpcoming ? "—" : step.timestamp,
  };
}

function TrackerRow({ step, connector }: { step: TrackerStepData; connector: boolean }) {
  const { label, state } = step;
  const { location, timestamp } = resolveStepText(step);

  return (
    <li aria-current={state === "current" ? "step" : undefined} className="flex w-full items-start gap-sm">
      <span className="flex shrink-0 flex-col items-center gap-2xs self-stretch">
        <TrackerNode state={state} />
        {connector && <span aria-hidden className={cn("w-0.5 min-h-px flex-1", CONNECTOR_STYLES[state])} />}
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col gap-3xs", connector && "pb-lg")}>
        <small className={cn("w-full", LABEL_STYLES[state])}>{label}</small>
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

function TrackerRail({ steps }: { steps: TrackerStepData[] }) {
  return (
    <ol aria-label="Shipment timeline" className="flex w-full items-start">
      {steps.map((step, i) => {
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;
        const { location, timestamp } = resolveStepText(step);
        return (
          <li
            key={i}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex flex-col gap-2xs",
              isFirst && "shrink-0 items-start",
              isLast && "shrink-0 items-end",
              !isFirst && !isLast && "min-w-0 flex-1 items-center"
            )}
          >
            <span className="flex w-full items-center">
              {!isFirst && (
                <span aria-hidden className={cn("h-0.5 min-w-px flex-1", CONNECTOR_STYLES[steps[i - 1].state])} />
              )}
              <TrackerNode state={step.state} />
              {!isLast && <span aria-hidden className={cn("h-0.5 min-w-px flex-1", CONNECTOR_STYLES[step.state])} />}
            </span>
            <span
              className={cn(
                "flex w-full flex-col gap-3xs",
                isFirst ? "items-start text-left" : isLast ? "items-end text-right" : "items-center text-center"
              )}
            >
              <small className={LABEL_STYLES[step.state]}>{step.label}</small>
              {location != null && <span className={cn("text-micro", META_STYLES[step.state])}>{location}</span>}
              {timestamp != null && <span className={cn("text-micro", META_STYLES[step.state])}>{timestamp}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Tracker({
  steps,
  trackingNumber,
  etaLabel = "ETA",
  eta,
  header = true,
  orientation = "vertical",
  className,
}: TrackerProps) {
  return (
    <div className={cn("flex w-full flex-col gap-md rounded-lg border border-border bg-card p-md", className)}>
      {header && (trackingNumber != null || eta != null) && (
        <div className="flex w-full items-start justify-between">
          {trackingNumber != null && (
            <span className="flex flex-col gap-3xs">
              <span className="text-micro text-muted-foreground">Tracking #</span>
              <small data-emphasis="default">{trackingNumber}</small>
            </span>
          )}
          {eta != null && (
            <span className="flex flex-col items-end gap-3xs text-right">
              <span className="text-micro text-muted-foreground">{etaLabel}</span>
              <small data-emphasis="default">{eta}</small>
            </span>
          )}
        </div>
      )}
      {orientation === "horizontal" ? (
        <TrackerRail steps={steps} />
      ) : (
        <ol aria-label="Shipment timeline" className="flex w-full flex-col items-start">
          {steps.map((step, i) => (
            <TrackerRow key={i} step={step} connector={i < steps.length - 1} />
          ))}
        </ol>
      )}
    </div>
  );
}
