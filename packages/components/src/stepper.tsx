// Stepper - the drawings at 54:74 and 54:56: 24px circular markers - Complete
// is a check on primary, Current its number on primary, Upcoming a muted
// bordered circle - joined by 2px connectors that "fill to the current step".
// "The Sell Form runs at least six steps with sub-steps, so expect to add
// markers rather than assume five": `steps` is a count or labels, never fixed.
//
// The semantics no drawing holds: an <ol> (steps are ordered), each marker a
// list item, the current one carrying aria-current="step", and each with an
// accessible name - "Step 3 of 6" plus its label - because five identical
// circles read as nothing at all.
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

export type StepperProps = {
  /** A count, or a label per step. */
  steps: number | string[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
};

export function Stepper({ steps, current, className }: StepperProps) {
  const labels = typeof steps === "number" ? Array.from({ length: steps }, () => null) : steps;
  const n = labels.length;

  return (
    <ol className={cn("flex w-full items-center gap-2", className)}>
      {labels.map((label, i) => {
        const state = i < current ? "complete" : i === current ? "current" : "upcoming";
        return (
          <React.Fragment key={i}>
            <li
              aria-current={state === "current" ? "step" : undefined}
              aria-label={`Step ${i + 1} of ${n}${label ? `: ${label}` : ""}`}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-micro font-medium",
                state === "upcoming"
                  ? "border border-border bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {state === "complete" ? (
                <Check aria-hidden className="size-3" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </li>
            {i < n - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-0.5 min-w-1 flex-1 rounded-full",
                  i < current ? "bg-primary" : "bg-neutral-300"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
