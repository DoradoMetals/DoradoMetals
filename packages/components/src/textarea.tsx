'use client'

// Textarea - the drawing at 37:2's description: "Multi-line field. Same state
// language as Input (Default / Focus / Success / Error / Disabled) and the
// same 2px label gap. Box is a fixed 96px tall; resize on an instance for
// longer entries. Optional character counter sits below, right-aligned."
//
// Input's anatomy, taller: the chassis border language on a min-h-24 box, the
// message line and the counter sharing the row below - message left, counter
// right, exactly as drawn. The counter turns destructive past the limit,
// which is also when aria-invalid fires if the caller passes maxLength
// enforcement upstream.
import * as React from "react";
import { FieldLabel } from "./field";
import { cn } from "./cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  message?: React.ReactNode;
  invalid?: boolean;
  success?: boolean;
  /** Renders "n / max" below-right. Needs `maxLength` to mean anything. */
  showCount?: boolean;
  className?: string;
};

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, message, invalid, success, showCount, className, id, disabled, maxLength, value, defaultValue, onChange, ...props },
    ref
  ) => {
    const autoId = React.useId();
    const areaId = id ?? autoId;
    const messageId = `${areaId}-message`;
    const [count, setCount] = React.useState(
      String(value ?? defaultValue ?? "").length
    );
    React.useEffect(() => {
      if (value != null) setCount(String(value).length);
    }, [value]);

    const over = maxLength != null && count > maxLength;

    return (
      <div className={cn("flex w-full flex-col gap-0.5", className)}>
        {label != null && (
          <FieldLabel
            htmlFor={areaId}
            className={cn(invalid && "text-destructive", success && "text-success")}
          >
            {label}
          </FieldLabel>
        )}
        <textarea
          ref={ref}
          id={areaId}
          disabled={disabled}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={(e) => {
            if (value == null) setCount(e.currentTarget.value.length);
            onChange?.(e);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={message != null ? messageId : undefined}
          className={cn(
            "min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-body text-foreground outline-none transition-colors",
            "placeholder:text-placeholder focus-visible:border-border-strong",
            invalid && "border-destructive",
            success && "border-success",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          )}
          {...props}
        />
        {(message != null || showCount) && (
          <span className="flex items-baseline justify-between gap-2">
            {message != null ? (
              <p
                id={messageId}
                className={cn(
                  "text-micro",
                  invalid ? "text-destructive" : success ? "text-success" : "text-muted-foreground"
                )}
              >
                {message}
              </p>
            ) : (
              <span />
            )}
            {showCount && (
              <span className={cn("text-micro", over ? "text-destructive" : "text-muted-foreground")}>
                {count}
                {maxLength != null && ` / ${maxLength}`}
              </span>
            )}
          </span>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
