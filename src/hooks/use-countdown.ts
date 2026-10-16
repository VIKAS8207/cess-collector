import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const id = setInterval(cb, 500);
  return () => clearInterval(id);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Whole seconds left until `endAt` (ms epoch). 0 when null or elapsed. */
export function useCountdown(endAt: number | null): number {
  const now = useSyncExternalStore(subscribe, nowSeconds, () => 0);
  if (endAt === null) return 0;
  return Math.max(0, Math.ceil(endAt / 1000) - now);
}
