import { useSyncExternalStore } from "react";

const subscribers = new Map<number, (cb: () => void) => () => void>();

function subscriberFor(ms: number) {
  let s = subscribers.get(ms);
  if (!s) {
    s = (cb) => {
      const id = setInterval(cb, ms);
      return () => clearInterval(id);
    };
    subscribers.set(ms, s);
  }
  return s;
}

/** Current time in ms, rounded down to `intervalMs`; re-renders every interval. */
export function useNow(intervalMs = 30_000): number {
  return useSyncExternalStore(
    subscriberFor(intervalMs),
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0
  );
}
