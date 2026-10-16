import type { LucideIcon } from "lucide-react";
import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export function BlockError({
  onRetry,
  className,
}: {
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        className
      )}
    >
      <CircleAlertIcon aria-hidden="true" className="size-6 text-destructive" />
      <p className="text-body-md text-foreground">We couldn&apos;t load this.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function BlockEmpty({
  icon: Icon,
  text,
  actionLabel,
  onAction,
  className,
}: {
  icon: LucideIcon;
  text: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        className
      )}
    >
      <Icon aria-hidden="true" className="size-6 text-primary" />
      <p className="text-body-md text-muted-foreground">{text}</p>
      <Button variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
