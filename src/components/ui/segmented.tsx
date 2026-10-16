"use client";

import { cn } from "cn";

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() =>
      document.getElementById(`seg-${label}-${next.value}`)?.focus()
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex rounded-full bg-muted p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            id={`seg-${label}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cn(
              "h-10 shrink-0 flex-1 rounded-full px-4 text-sm whitespace-nowrap outline-none transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              active
                ? "bg-background text-primary shadow-card"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
