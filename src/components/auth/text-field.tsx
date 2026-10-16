"use client";

import { useState } from "react";
import { CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

type TextFieldProps = Omit<
  React.ComponentProps<"input">,
  "id" | "value" | "onChange"
> & {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  trailing?: React.ReactNode;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  trailing,
  className,
  "aria-describedby": extraDescribedBy,
  ...rest
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null, extraDescribedBy ?? null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
        {rest.required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(trailing && "pr-12")}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center">
            {trailing}
          </div>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-foreground">
          <CircleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  autoComplete,
  ...props
}: Omit<TextFieldProps, "type" | "trailing" | "autoComplete"> & {
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" className="size-4" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-4" />
          )}
        </button>
      }
    />
  );
}
