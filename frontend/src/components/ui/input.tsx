import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Verge: canvas bg, 1px white/30 border, 2px radius (newspaper-form), 15px sans white
          "flex h-10 w-full bg-canvas border border-white/30 rounded-form",
          "px-3 py-2 font-sans text-[15px] text-white",
          "placeholder:text-[#949494]",
          // Focus: border shifts to mint, no ring glow
          "focus:outline-none focus:border-mint transition-colors duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
