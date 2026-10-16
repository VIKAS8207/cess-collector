import { useSyncExternalStore } from "react";

type Kind = "local" | "session";

/**
 * Tiny external store over web storage. `undefined` means "not hydrated yet"
 * (server render), `null` means "hydrated, nothing stored".
 */
export function createStore(key: string, kind: Kind) {
  const listeners = new Set<() => void>();
  let memory: string | null = null;

  const storage = (): Storage | null => {
    try {
      return kind === "local" ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };

  const emit = () => listeners.forEach((l) => l());

  const get = (): string | null => {
    try {
      return storage()?.getItem(key) ?? memory;
    } catch {
      return memory;
    }
  };

  return {
    get,
    /** `memoryOnly` keeps the value for this page load only (lost on reload). */
    set(value: string | null, opts?: { memoryOnly?: boolean }) {
      memory = opts?.memoryOnly ? value : null;
      try {
        const s = storage();
        if (opts?.memoryOnly || value === null) s?.removeItem(key);
        else s?.setItem(key, value);
      } catch {
        memory = value;
      }
      emit();
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

export type Store = ReturnType<typeof createStore>;

export function useStore(store: Store): string | null | undefined {
  return useSyncExternalStore(store.subscribe, store.get, () => undefined);
}
