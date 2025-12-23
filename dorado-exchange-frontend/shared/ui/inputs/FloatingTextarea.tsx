// floating-textarea.tsx
import * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const customTextareaVariant = cva(
  "px-3 pt-5 pb-2 w-full text-neutral-900 rounded-md border border-input/65 ring-offset-background bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-35 resize-none",
  {
    variants: {
      size: {
        xs: "text-sm min-h-[2.5rem]",
        sm: "text-sm min-h-[3rem]",
        md: "text-base min-h-[3.5rem]",
        lg: "text-lg min-h-[4rem]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

export interface FloatingTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size">, VariantProps<typeof customTextareaVariant> {
  size?: "xs" | "sm" | "md" | "lg"
}

const CustomTextarea = React.forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(({ className, size, ...props }, ref) => {
  return <textarea className={cn(customTextareaVariant({ size, className }))} ref={ref} {...props} />
})
CustomTextarea.displayName = "CustomTextarea"

const FloatingTextarea = React.forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(({ className, ...props }, ref) => {
  return <CustomTextarea placeholder=" " className={cn("peer bg-transparent border-none", className)} ref={ref} {...props} />
})
FloatingTextarea.displayName = "FloatingTextarea"

export { CustomTextarea, FloatingTextarea }
