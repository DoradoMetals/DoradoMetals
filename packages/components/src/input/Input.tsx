'use client'

import * as React from "react";
import { fieldTrigger, FieldLabel } from "../field/Field";
import { cn } from "../cn";

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: React.ReactNode;
  message?: React.ReactNode;
  invalid?: boolean;
  success?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, message, invalid, success, leading, trailing, className, id, disabled, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const messageId = `${inputId}-message`;

    return (
      <div className={cn("flex w-full flex-col gap-0.5", className)}>
        {label != null && (
          <FieldLabel
            htmlFor={inputId}
            className={cn(invalid && "text-destructive", success && "text-success")}
          >
            {label}
          </FieldLabel>
        )}
        <div
          data-invalid={invalid || undefined}
          data-disabled={disabled || undefined}
          className={cn(fieldTrigger(), success && "border-success")}
        >
          {leading != null && <span className="shrink-0 text-muted-foreground">{leading}</span>}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={message != null ? messageId : undefined}
            className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
            {...props}
          />
          {trailing != null && (
            <span className="shrink-0 text-small text-muted-foreground">{trailing}</span>
          )}
        </div>
        {message != null && (
          <p
            id={messageId}
            className={cn(
              "text-micro",
              invalid ? "text-destructive" : success ? "text-success" : "text-muted-foreground"
            )}
          >
            {message}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
