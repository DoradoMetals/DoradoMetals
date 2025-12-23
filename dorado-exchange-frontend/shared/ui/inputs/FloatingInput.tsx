import * as React from "react";
import { cn } from "@/shared/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";

// ----------------------------------------------------------------------

const customInputVariant = cva(
	"px-3 py-2 flex leading-4 w-full text-neutral-900 rounded-md border border-input/65 ring-offset-background bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-35",
	{
		variants: {
			size: {
				xs: "h-10 text-base",
				sm: "h-10 text-base",
				md: "h-14 text-base py-4",
				lg: "h-16 text-lg",
			},
		},
		defaultVariants: {
			size: "sm",
		},
	},
);

interface FloatingInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">, VariantProps<typeof customInputVariant> {
	size?: "xs" | "sm" | "md" | "lg" | undefined;
}

const CustomInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(({ className, type = "text", size, ...props }, ref) => {
	return <input type={type} className={cn(customInputVariant({ size, className }))} ref={ref} {...props} />;
});
CustomInput.displayName = "CustomInput";

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(({ className, ...props }, ref) => {
	return <CustomInput placeholder=" " className={cn("peer bg-transparent", className)} ref={ref} {...props} />;
});
FloatingInput.displayName = "FloatingInput";

export { FloatingInput, CustomInput, type FloatingInputProps };
