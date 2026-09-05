import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../cn";

export const fieldTrigger = cva(
  cn(
    "flex h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 text-body text-foreground transition-colors",
    "border-border focus-within:border-primary focus-visible:outline-none focus-visible:border-primary",
    "aria-[invalid=true]:border-destructive data-[invalid]:border-destructive",
    "disabled:pointer-events-none disabled:bg-muted disabled:text-foreground-disabled",
    "data-[disabled]:pointer-events-none data-[disabled]:bg-muted data-[disabled]:text-foreground-disabled"
  )
);

export const fieldPanel = cva(
  "z-50 flex flex-col gap-2 rounded-lg border border-border bg-popover p-2"
);

export const fieldOption = cva(
  cn(
    "flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-3 text-body text-muted-foreground outline-none",
    "data-[highlighted]:bg-accent data-[highlighted]:text-foreground hover:bg-accent hover:text-foreground",
    "data-[state=checked]:text-foreground aria-[selected=true]:text-foreground",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  )
);

export type FieldProps = {
  label: React.ReactNode;
  htmlFor?: string;
  message?: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function Field({ label, htmlFor, message, invalid, children, className }: FieldProps) {
  const autoId = React.useId();
  const messageId = `${htmlFor ?? autoId}-message`;
  return (
    <div className={cn("flex w-full flex-col gap-0.5", className)}>
      <FieldLabel htmlFor={htmlFor} className={cn(invalid && "text-destructive")}>
        {label}
      </FieldLabel>
      {children}
      {message != null && (
        <p id={messageId} className={cn("text-micro", invalid ? "text-destructive" : "text-muted-foreground")}>
          {message}
        </p>
      )}
    </div>
  );
}

export const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-small font-medium text-muted-foreground", className)} {...props} />
  )
);
FieldLabel.displayName = "FieldLabel";
