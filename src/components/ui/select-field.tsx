import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";

type Option = { value: string; label: string };

/** Native select styled like Input. Label is always visible unless `hideLabel`. */
export function SelectField({
  id,
  label,
  hideLabel,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  disabled,
  className,
  icon,
  ...rest
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
} & Omit<React.ComponentProps<"select">, "id" | "value" | "onChange" | "className" | "children">) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className={cn("text-sm text-foreground", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
        <select
          id={id}
          name={id}
          value={value}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 w-full appearance-none rounded-field border border-input bg-background pr-9 text-[15px] text-foreground outline-none",
            icon ? "pl-9" : "pl-3",
            "hover:border-primary focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
