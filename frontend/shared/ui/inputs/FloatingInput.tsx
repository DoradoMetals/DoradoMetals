import * as React from "react";
import { cn } from "@/shared/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";

/* ONE INPUT, ONE APPEARANCE (ruling 28). The border token here was
   `border-input/65` - a fourth field treatment, differing from `Input`'s by a
   35% alpha nobody chose. It is now the same `--input` hairline every other
   field in the app draws.

   `size` is NOT an appearance variant and stays: ruling 20 puts height, padding
   and type on the size axis. The floating label needs a taller box than a plain
   field, which is a size question.

   ⚠ ONE THING DELIBERATELY LEFT DIFFERENT, and it needs Jacob: this input's
   FOCUS is `ring-2 ring-primary`, while `Input`/`Textarea` escalate the border
   to `--border-strong`. Those are two focus vocabularies. Unifying downward
   would make focus much less visible on every floating field, which is an
   accessibility regression, and unifying upward restyles focus app-wide - so
   neither is a mechanical call. Reported, not guessed at.
   ---------------------------------------------------------------------- */

const customInputVariant = cva(
	"px-3 py-2 flex leading-4 w-full text-foreground rounded-md border border-input ring-offset-background bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-35",
	{
		variants: {
			size: {
				xs: "h-10 text-base",
				sm: "h-10 text-base",
				md: "h-14 text-base py-4",
				lg: "h-16 text-h4",
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
