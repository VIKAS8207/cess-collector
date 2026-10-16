import { Pill } from "@/components/ui/pill";
import type { Movement } from "@/lib/domain/types";

export function StatusPill({ movement }: { movement: Pick<Movement, "status" | "flag"> }) {
  if (movement.status === "Flagged") {
    return movement.flag?.clearedAt ? (
      <Pill tone="neutral">Flag cleared</Pill>
    ) : (
      <Pill tone="danger">Flagged</Pill>
    );
  }
  return <Pill tone={movement.status === "Inside" ? "brand" : "neutral"}>{movement.status}</Pill>;
}
