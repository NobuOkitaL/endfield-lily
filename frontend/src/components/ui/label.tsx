import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  // Verge: JetBrains Mono 11px UPPERCASE 1.5px letter-spacing #949494
  "font-mono uppercase text-[#949494] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    style={{ fontSize: "11px", letterSpacing: "1.5px" }}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
