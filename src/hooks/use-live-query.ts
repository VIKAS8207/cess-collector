import { useEffect, useEffectEvent, useState } from "react";
import { useStoreVersion } from "@/lib/domain/store";

type Result<T> = { key: string; data?: T; error?: boolean };

export type Query<T> =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: T };

const POLL_MS = 20_000;

/**
 * Loads data for a page block. A changed `deps` string shows the skeleton; a
 * mock-store change or the 20 s poll refetches silently (stale data stays on
 * screen), so lists refresh without flicker or layout shift.
 */
export function useLiveQuery<T>(deps: string, load: (attempt: number) => Promise<T>): Query<T> {
  const version = useStoreVersion();
  const [attempt, setAttempt] = useState(0);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = `${deps}:${attempt}`;
  const run = useEffectEvent(() => load(attempt));

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    run().then(
      (data) => live && setResult({ key, data }),
      () => live && setResult((prev) => (live && prev?.key === key && prev.data ? prev : { key, error: true }))
    );
    return () => {
      live = false;
    };
  }, [key, version, tick]);

  if (result?.key !== key) return { status: "loading" };
  if (result.error) return { status: "error", retry: () => setAttempt((a) => a + 1) };
  return { status: "ready", data: result.data as T };
}
