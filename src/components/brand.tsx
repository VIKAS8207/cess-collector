import { cn } from "cn";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M10 21c1.4 1.3 3.2 2 5.6 2 3 0 4.8-1.3 4.8-3.2 0-4.4-9.6-2-9.6-6.6 0-1.8 1.7-3.2 4.4-3.2 2 0 3.5.6 4.6 1.6"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

export function Brand({ showName = true }: { showName?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <BrandMark />
      {showName && (
        <span className="text-[17px] tracking-[-0.2px] text-foreground">
          SAAS Collector
        </span>
      )}
    </span>
  );
}
