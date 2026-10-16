import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Live region is always mounted so assistive tech announces new messages
 * politely without stealing focus.
 */
export function FormBanner({
  id,
  message,
  tone = "error",
  action,
  className,
}: {
  id?: string;
  message?: React.ReactNode;
  tone?: "error" | "info";
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? CircleAlertIcon : InfoIcon;
  return (
    <div id={id} role="status" aria-live="polite" className={className}>
      {message && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-field border px-3 py-3 text-sm",
            tone === "error"
              ? "border-destructive/40 bg-destructive/10"
              : "border-border bg-muted"
          )}
        >
          <div className="flex items-start gap-2">
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0",
                tone === "error" ? "text-destructive" : "text-primary"
              )}
            />
            <p className="text-foreground">{message}</p>
          </div>
          {action}
        </div>
      )}
    </div>
  );
}
