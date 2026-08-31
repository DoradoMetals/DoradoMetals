'use client'

// Alert - the drawing at 54:44: "Inline status message: icon, title, body.
// Success uses the real status/success-muted ground; Danger, Warning and Info
// tint their hue at 16% because the palette carries only one step per status
// colour."
//
// The code spells all four hues the same way (bg-{hue}/15 - the tint the app
// already used everywhere) and neutral as the plain card. The drawing's own
// description flags the muted-token debt; when those tokens exist this file
// swaps four classes.
//
// The hallmark no drawing carries: ANNOUNCEMENT. Danger and warning render
// role="alert" - interruptive, read immediately - while neutral, success and
// info are role="status", read at the next pause. An inline message that a
// screen reader never says is a decoration, not an alert.
import * as React from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";

import { Button } from "../button/Button";
import { cva } from "class-variance-authority";
import { cn } from "../cn";

const alertVariants = cva("flex w-full items-start gap-2 rounded-lg border p-3", {
  variants: {
    intent: {
      neutral: "border-border bg-card",
      success: "border-success bg-success/15",
      danger: "border-destructive bg-destructive/15",
      warning: "border-warning bg-warning/15",
      info: "border-info bg-info/15",
    },
  },
  defaultVariants: { intent: "neutral" },
});

const TITLE = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
} as const;

const ICONS = {
  neutral: Info,
  success: CheckCircle2,
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
} as const;

export type AlertIntent = keyof typeof TITLE;

export type AlertProps = {
  intent?: AlertIntent;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Replaces the intent's default 16px icon; `false` hides it. */
  icon?: React.ReactNode | false;
  /** Renders the X clear control (Button tertiary/iconXs) when given. */
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ intent = "neutral", title, children, icon, onDismiss, className }: AlertProps) {
  const DefaultIcon = ICONS[intent];
  return (
    <div
      role={intent === "danger" || intent === "warning" ? "alert" : "status"}
      className={cn(alertVariants({ intent }), className)}
    >
      {icon !== false && (
        // 19.5px title line, 16px icon: 2px pad centers it WITH THE TITLE,
        // not the whole text block (Jacob, 2026-08-30).
        <span className={cn("mt-[2px] shrink-0", TITLE[intent])}>
          {icon ?? <DefaultIcon aria-hidden className="size-4" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-small">
        <span className={cn("font-medium", TITLE[intent])}>{title}</span>
        {children != null && <span className="text-muted-foreground">{children}</span>}
      </span>
      {onDismiss && (
        <Button
          variant="tertiary"
          size="iconXs"
          aria-label="Dismiss"
          className="-mr-1 shrink-0"
          onClick={onDismiss}
        >
          <X aria-hidden className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
