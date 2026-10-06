import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Primary is ink (never geru); the global :focus-visible ring replaces shadcn's ring classes.
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent text-body font-medium transition-[background-color,border-color,color,transform] duration-(--motion-fast) ease-snap active:scale-(--press-scale) disabled:pointer-events-none disabled:opacity-45 aria-disabled:opacity-45 aria-disabled:active:scale-100 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink-body",
        outline: "border-rule-strong bg-paper text-ink hover:bg-surface-2",
        ghost: "text-ink hover:bg-surface-2",
        link: "h-auto px-0 text-geru underline decoration-1 underline-offset-3",
        destructive: "bg-bad-wash text-bad hover:bg-surface-2",
      },
      size: {
        default: "h-9 px-4 pointer-coarse:h-11",
        sm: "h-8 px-3 pointer-coarse:h-11",
        icon: "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
