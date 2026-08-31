'use client'

// Input - the drawing at 26:391: label above a bordered field, a Message line
// below it, and ONE trailing slot - "the unit label and the clear affordance
// can never both occupy the slot; two booleans would allow that". The single
// `trailing` prop is that sentence as an API.
//
// The box is the FIELD CHASSIS (field.tsx) - the same clothes Select and
// Autocomplete wear - with the drawing's state language: focus escalates the
// border to border-strong, Error turns border, label and message destructive,
// Success turns them success. The wiring no drawing holds: the label is FOR
// the input, the message is its aria-describedby, and error sets aria-invalid
// - so what the eye reads as red, the screen reader hears as invalid.
import * as React from "react";
import { fieldTrigger, FieldLabel } from "../field/Field";
import { cn } from "../cn";

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: React.ReactNode;
  /** Below the box: destructive under error, success under success, muted
   *  otherwise - the drawing's Message line. */
  message?: React.ReactNode;
  invalid?: boolean;
  success?: boolean;
  leading?: React.ReactNode;
  /** The one trailing slot: a unit label ("t oz") or a clear control - never
   *  both, by construction. */
  trailing?: React.ReactNode;
  /** Layout for the whole field; the box itself is the component's. */
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
