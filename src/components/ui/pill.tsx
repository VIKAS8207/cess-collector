import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none font-normal tracking-[0.1px] whitespace-nowrap",
  {
    variants: {
      tone: {
        brand: "bg-tag text-tag-foreground",
        neutral: "bg-muted text-foreground",
        danger: "bg-destructive/10 text-foreground",
      },
    },
    defaultVariants: { tone: "brand" },
  }
)

function Pill({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof pillVariants>) {
  return <span className={cn(pillVariants({ tone }), className)} {...props} />
}

export { Pill }
