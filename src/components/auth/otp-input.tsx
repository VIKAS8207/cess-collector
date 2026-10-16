"use client";

import { useRef } from "react";
import { cn } from "cn";

const LENGTH = 6;

export function focusOtp(index = 0) {
  document.getElementById(`otp-${index}`)?.focus();
}

export function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  labelId,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  labelId: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  const fill = (start: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return;
    const next = digits.slice();
    let i = start;
    for (const ch of clean) {
      if (i >= LENGTH) break;
      next[i++] = ch;
    }
    onChange(next.join(""));
    focusAt(Math.min(i, LENGTH - 1));
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex justify-between gap-2"
    >
      {digits.map((d, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          readOnly={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid ? true : undefined}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const clean = e.target.value.replace(/\D/g, "");
            if (!clean) {
              const next = digits.slice();
              next[i] = "";
              onChange(next.join(""));
              return;
            }
            fill(i, clean);
          }}
          onKeyDown={(e) => {
            // Typing the digit a box already holds fires no change event, so handle digits here.
            if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              fill(i, e.key);
              return;
            }
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              e.preventDefault();
              const next = digits.slice();
              next[i - 1] = "";
              onChange(next.join(""));
              focusAt(i - 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              focusAt(i - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              focusAt(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(0, e.clipboardData.getData("text"));
          }}
          className={cn(
            "h-12 w-full min-w-0 rounded-field border border-input bg-background text-center text-xl tabular-nums text-foreground outline-none transition-colors",
            "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30",
            "read-only:opacity-60",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          )}
        />
      ))}
    </div>
  );
}
