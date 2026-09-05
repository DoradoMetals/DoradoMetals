import * as React from "react";
import { FieldLabel as Label } from "@dorado/components"
import { cn } from "@/shared/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";

// ----------------------------------------------------------------------

const floatingLabelVariant = cva(
	"select-none pointer-events-none transition-all cursor-text peer-focus:text-primary text-subtle absolute z-10 duration-300 peer-placeholder-shown:start-3 font-medium leading-4 text-micro peer-focus:text-micro start-1 peer-focus:start-1 -top-4 peer-focus:-top-4",
	{
		variants: {
			size: {
				xs: "peer-placeholder-shown:text-small peer-placeholder-shown:top-2.5",
				sm: "peer-placeholder-shown:text-small peer-placeholder-shown:top-2.5",
				md: "peer-placeholder-shown:text-body peer-placeholder-shown:top-3.5",
				lg: "peer-placeholder-shown:text-h4 peer-placeholder-shown:top-4",
				textarea: "peer-placeholder-shown:text-body peer-placeholder-shown:top-3.5",
			},
		},
		defaultVariants: {
			size: "sm",
		},
	},
);

interface FloatingLabelProps extends React.ComponentPropsWithoutRef<'label'>, VariantProps<typeof floatingLabelVariant> {}

const FloatingLabel = React.forwardRef<HTMLLabelElement, FloatingLabelProps>(({ size = "sm", className, ...props }, ref) => {
	return (
		<Label
			className={cn(floatingLabelVariant({ size, className }))}
			ref={ref}
			{...props}
		/>
	);
});
FloatingLabel.displayName = "FloatingLabel";

export { FloatingLabel, floatingLabelVariant, type FloatingLabelProps };
