import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-canvas group-[.toaster]:text-white group-[.toaster]:border group-[.toaster]:border-white/20 group-[.toaster]:rounded-card",
          description: "group-[.toast]:text-[#949494]",
          actionButton:
            "group-[.toast]:bg-mint group-[.toast]:text-black",
          cancelButton:
            "group-[.toast]:bg-slate-surface group-[.toast]:text-[#e9e9e9]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
