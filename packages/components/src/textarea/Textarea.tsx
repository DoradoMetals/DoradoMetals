'use client'

import * as React from "react";
import { FieldLabel } from "../field/Field";
import { cn } from "../cn";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  message?: React.ReactNode;
  invalid?: boolean;
  success?: boolean;
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
            "min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-h5 text-foreground outline-none transition-colors",
            "placeholder:text-placeholder focus-visible:border-primary",
            invalid && "border-destructive",
            success && "border-success",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-foreground-disabled"
          )}
          {...props}
        />
        {message != null && (
          <p
            id={messageId}
            className={cn(
              "text-micro w-full",
              invalid ? "text-destructive" : success ? "text-success" : "text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}
        {showCount && (
          <span className={cn("text-micro w-full text-right", over ? "text-destructive" : "text-muted-foreground")}>
            {count}
            {maxLength != null && ` / ${maxLength}`}
          </span>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
