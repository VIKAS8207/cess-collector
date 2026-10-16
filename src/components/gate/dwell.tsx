import { TriangleAlertIcon } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { formatDuration } from "@/lib/format";
import { LONG_STAY_MS } from "@/lib/domain/types";
import { overstayMs } from "@/lib/domain/settings";

/** Dwell time with palette-only threshold styling: normal / long stay / over-stay. */
export function Dwell({ ms, open = true }: { ms: number | null; open?: boolean }) {
  if (ms === null) return <span className="text-muted-foreground">—</span>;
  const text = formatDuration(ms);
  if (!open) return <span className="tabular-nums">{text}</span>;
  if (ms > overstayMs()) {
    return (
      <Pill tone="danger" className="tabular-nums">
        <TriangleAlertIcon aria-hidden="true" className="size-3 text-destructive" />
        <span className="sr-only">Over-stay: </span>
        {text}
      </Pill>
    );
  }
  if (ms > LONG_STAY_MS) {
    return (
      <Pill tone="brand" className="tabular-nums">
        <span className="sr-only">Long stay: </span>
        {text}
      </Pill>
    );
  }
  return <span className="tabular-nums">{text}</span>;
}
