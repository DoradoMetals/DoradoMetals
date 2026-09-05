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
  inputClassName?: string;
};

const NUMBER_FIELD =
  "[&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { label, message, invalid, success, leading, trailing, className, inputClassName, id, disabled, type, inputMode, ...props },
    ref
  ) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const messageId = `${inputId}-message`;
    const isNumber = type === "number";

    return (
      <div className={cn("flex w-full flex-col gap-0.5", className)}>
        {label != null && (
          <FieldLabel
            htmlFor={inputId}
            className={cn(
              invalid && "text-destructive",
              success && "text-success",
              disabled && "text-foreground-disabled"
            )}
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
            type={type}
            inputMode={inputMode ?? (isNumber ? "decimal" : undefined)}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-h5 text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:text-foreground-disabled",
              isNumber && NUMBER_FIELD,
              inputClassName
            )}
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
