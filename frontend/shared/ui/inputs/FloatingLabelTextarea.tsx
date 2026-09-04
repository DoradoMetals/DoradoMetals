// floating-label-textarea.tsx
import * as React from "react"
import { cn } from "@/shared/utils/cn"
import { type FloatingTextareaProps, FloatingTextarea } from "./FloatingTextarea"
import { FloatingLabel } from "./FloatingLabel"

export type FloatingLabelTextareaProps = FloatingTextareaProps & {
  containerProps?: React.HTMLAttributes<HTMLDivElement>
  label?: string
  error?: boolean
}

const FloatingLabelTextarea = React.forwardRef<
  React.ElementRef<typeof FloatingTextarea>,
  React.PropsWithoutRef<FloatingLabelTextareaProps>
>(({ id, label, error = false, className, containerProps, ...props }, ref) => {
  return (
    <div
      {...containerProps}
      className={cn(
        "relative",
        error && "[&>*]:text-destructive [&>fieldset]:border-destructive",
        containerProps?.className
      )}
    >
      <FloatingTextarea
        ref={ref}
        id={id}
        className={cn(
          className,
          "focus-visible:ring-ring focus-visible:ring-0 focus-visible:ring-opacity-0",
          error && "text-destructive"
        )}
        {...props}
      />

      <FloatingLabel
        htmlFor={id}
        size={props.size}
        className={cn("peer-focus:text-primary", {
          "text-destructive peer-focus:text-destructive": error,
        })}
      >
        {label}
      </FloatingLabel>

      <fieldset
        className={cn(
          "absolute peer-focus-visible:border-none transition-all peer-focus-visible:border-primary inset-0 -top-[5px] rounded-md m-0 py-0 text-left px-2 pointer-events-none min-w-0 peer-focus:[&>legend]:max-w-full peer-focus-visible:[&>legend]:max-w-full peer-placeholder-shown:[&>legend]:max-w-0"
        )}
      >
        {/* The legend is an invisible MEASURING BOX: it cuts the notch the
            floating label sits in, so its type has to match the label's
            exactly or the notch is the wrong width. `<small>` is that size by
            tag, which keeps the size in typography.css where every other size
            lives. */}
        <legend className="transition-all invisible whitespace-nowrap overflow-hidden w-auto max-w-full h-3 leading-4 p-0">
          <small className="px-1 visible inline-block opacity-0">{label}</small>
        </legend>
      </fieldset>
    </div>
  )
})

FloatingLabelTextarea.displayName = "FloatingLabelTextarea"

export { FloatingLabelTextarea }
