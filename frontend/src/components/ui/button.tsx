import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base: shared across all variants
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "transition-all duration-[180ms] ease-out",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    // Focus: 2px outline Focus Cyan
    "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-[#1eaedb]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Jelly Mint Pill — primary CTA
        default: [
          "bg-mint text-black font-mono uppercase",
          "rounded-pill px-6 py-2.5",
          "hover:bg-white/20 hover:text-black hover:outline hover:outline-1 hover:outline-[#c2c2c2]",
          "active:bg-[rgba(140,140,140,0.87)] active:opacity-50",
        ].join(" "),

        // Dark Slate Pill — secondary
        secondary: [
          "bg-slate-surface text-[#e9e9e9] font-sans text-sm",
          "rounded-pill px-6 py-2.5",
          "hover:bg-white/20 hover:text-black hover:outline hover:outline-1 hover:outline-[#c2c2c2]",
        ].join(" "),

        // Outlined Mint — tertiary outline CTA
        outline: [
          "bg-transparent text-mint font-mono uppercase",
          "border border-mint rounded-outline-cta px-5 py-2.5",
          "hover:bg-mint hover:text-black",
        ].join(" "),

        // Ghost — text-only, hover to link blue
        ghost: [
          "bg-transparent text-white",
          "rounded-pill px-3 py-2",
          "hover:text-link-hover",
        ].join(" "),

        // Outlined Ultraviolet — destructive / promotional
        destructive: [
          "bg-transparent text-ultraviolet font-mono uppercase",
          "border border-ultraviolet rounded-cta px-5 py-2.5",
          "hover:bg-ultraviolet hover:text-white",
        ].join(" "),

        // Link variant
        link: "text-primary underline-offset-4 hover:underline p-0",
      },
      size: {
        default: "",
        sm: "text-xs px-4 py-1.5",
        lg: "text-base px-8 py-3",
        icon: "h-10 w-10 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Apply mono + uppercase + tracking for default/outline/destructive
const MONO_VARIANTS = new Set(["default", "outline", "destructive"])

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const isMono = MONO_VARIANTS.has(variant ?? "default")
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          isMono ? "font-mono uppercase" : "",
          className,
        )}
        style={
          isMono
            ? { fontSize: "12px", letterSpacing: "1.5px", fontWeight: 600, ...(props.style as React.CSSProperties) }
            : (props.style as React.CSSProperties)
        }
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
