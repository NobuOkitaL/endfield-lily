import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Verge: slate bg, rounded-tag, no shadow
      "inline-flex h-10 items-center justify-center rounded-tag bg-slate-surface p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Verge: rounded-tag, mono uppercase, active = mint inset underline, no shadow
      "inline-flex items-center justify-center whitespace-nowrap rounded-tag px-3 py-1.5",
      "font-mono uppercase text-[11px] transition-all duration-150",
      "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-[#1eaedb]",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-canvas data-[state=active]:text-signal",
      "data-[state=inactive]:text-[#949494] hover:text-military",
    ).toString()}
    style={{ letterSpacing: '1.5px' }}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-[#1eaedb]",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
