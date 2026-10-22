import { useSyncExternalStore } from "react";
import { activeGate, overstayMs } from "./settings";
import { buildSeed, startOfDay } from "./seed";
import { buildAgentSeed } from "./agent-seed";
import type { AgentData } from "./agent-types";
import type { TraderData } from "./trader-types";
import {
  DAY,
  HOUR,
  nextStage,
  type EntryInput,
  type ExceptionEvent,
  type ExceptionItem,
  type ExceptionKind,
  type Movement,
} from "./types";

/**
 * In-memory mock database shared by every page. Mutations bump `version`, which
 * live queries watch, so a new entry shows up everywhere without a reload.
 * Swap these functions for real API calls later.
 */
type State = {
  movements: Movement[];
  events: ExceptionEvent[];
  agent: AgentData;
  /** Built on first use, by trader-store. */
  trader: TraderData | null;
  version: number;
};

let state: State | null = null;
const listeners = new Set<() => void>();

export function db(): State {
  if (!state) {
    const now = Date.now();
    const seed = buildSeed(now);
    state = { ...seed, agent: buildAgentSeed(seed.movements, now), trader: null, version: 1 };
  }
  return state;
}

export function commit() {
  const s = db();
  s.version += 1;
  listeners.forEach((l) => l());
}

export function subscribeStore(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const useStoreVersion = () =>
  useSyncExternalStore(subscribeStore, () => db().version, () => 0);

export const normalizeId = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- reads ----------

export const allMovements = () => db().movements;
export const allEvents = () => db().events;
export const getMovement = (id: string) => db().movements.find((m) => m.id === id);

export const openMovements = () =>
  db()
    .movements.filter((m) => m.status === "Inside")
    .sort((a, b) => (b.entryAt ?? 0) - (a.entryAt ?? 0));

export function dwellOf(m: Movement, now: number): number | null {
  if (!m.entryAt) return null;
  return (m.exitAt ?? now) - m.entryAt;
}

export type EntryCheck =
  | { kind: "ok" }
  | { kind: "duplicate"; movement: Movement }
  | { kind: "conflict"; movement: Movement };

/** Rule 1: one open movement per plate; FASTag may not point at a different open vehicle. */
export function checkEntry(plateRaw: string, fastagRaw: string): EntryCheck {
  const plate = normalizeId(plateRaw);
  const fastag = normalizeId(fastagRaw);
  const open = openMovements();
  if (plate) {
    const byPlate = open.find((m) => normalizeId(m.plate) === plate);
    if (byPlate) return { kind: "duplicate", movement: byPlate };
  }
  if (fastag) {
    const byTag = open.find((m) => normalizeId(m.fastag) === fastag);
    if (byTag) {
      return plate && normalizeId(byTag.plate) !== plate
        ? { kind: "conflict", movement: byTag }
        : { kind: "duplicate", movement: byTag };
    }
  }
  return { kind: "ok" };
}

export function recentPlates(limit = 8) {
  const seen = new Set<string>();
  const out: Movement[] = [];
  for (const m of db().movements) {
    if (!m.plate) continue;
    const key = normalizeId(m.plate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= limit * 6) break;
  }
  return out;
}

export function exceptionItems(now: number): ExceptionItem[] {
  const s = db();
  const items: ExceptionItem[] = [];
  for (const m of s.movements) {
    if (m.flag) {
      items.push({
        id: `flag-${m.id}`,
        kind: m.flag.kind,
        at: m.flag.at,
        plate: m.plate,
        fastag: m.fastag,
        reason: m.flag.reason,
        movementId: m.id,
        resolved: !!m.flag.clearedAt,
      });
    }
    const dwell = dwellOf(m, now);
    if (m.entryAt && dwell !== null && dwell > overstayMs() && m.status !== "Flagged") {
      items.push({
        id: `over-${m.id}`,
        kind: "over-stay",
        at: m.exitAt ?? m.entryAt + overstayMs(),
        plate: m.plate,
        fastag: m.fastag,
        reason: m.status === "Inside" ? "Still inside past the allowed stay." : "Left after the allowed stay.",
        movementId: m.id,
        resolved: m.status !== "Inside",
      });
    }
  }
  for (const e of s.events) {
    items.push({
      id: e.id,
      kind: e.kind,
      at: e.at,
      plate: e.plate,
      fastag: e.fastag,
      reason: e.reason,
      movementId: e.movementId,
      resolved: true,
    });
  }
  return items.sort((a, b) => b.at - a.at);
}

/** Open exceptions only, newest first. Events from today count as open. */
export function attentionItems(now: number): ExceptionItem[] {
  const today = startOfDay(now);
  return exceptionItems(now).filter((i) => {
    if (i.id.startsWith("ev-") || i.id.startsWith("evt-")) return i.at >= today;
    return !i.resolved;
  });
}

// ---------- writes ----------

export type EntryResult =
  | { ok: true; movement: Movement }
  | { ok: false; code: "duplicate" | "conflict"; movement: Movement };

export function createEntry(input: EntryInput, operator: string): EntryResult {
  const check = checkEntry(input.plate, input.fastag);
  const now = Date.now();
  if (check.kind !== "ok") {
    db().events.unshift({
      id: `evt-${uid()}`,
      kind: check.kind === "duplicate" ? "duplicate-attempt" : "conflict",
      at: now,
      plate: normalizeId(input.plate),
      fastag: normalizeId(input.fastag),
      reason:
        check.kind === "duplicate"
          ? "Plate already has an open entry."
          : "FASTag is already linked to another vehicle that is inside.",
      operator,
      gate: activeGate(),
      movementId: check.movement.id,
    });
    commit();
    return { ok: false, code: check.kind, movement: check.movement };
  }
  const n = db().movements.length + 1;
  const movement: Movement = {
    id: `mv-${uid()}`,
    entryNo: `GE-${1000 + n}`,
    ...input,
    plate: normalizeId(input.plate),
    fastag: normalizeId(input.fastag),
    entryAt: now,
    exitAt: null,
    status: "Inside",
    operator,
    gate: activeGate(),
    createdAt: now,
    updatedAt: now,
    audit: [{ at: now, by: operator, action: "Entry recorded" }],
  };
  db().movements.unshift(movement);
  commit();
  return { ok: true, movement };
}

export function approveExit(id: string, operator: string): Movement | null {
  const m = getMovement(id);
  if (!m || m.status !== "Inside") return null; // Rule 2: exit needs an open entry
  const now = Date.now();
  m.exitAt = now;
  m.status = "Exited";
  m.exitOperator = operator;
  m.updatedAt = now;
  m.audit.push({ at: now, by: operator, action: "Exit approved" });
  commit();
  return m;
}

export function flagNoEntry(plateRaw: string, operator: string): Movement {
  const now = Date.now();
  const plate = normalizeId(plateRaw);
  const known = db().movements.find(
    (m) => normalizeId(m.plate) === plate || normalizeId(m.fastag) === plate
  );
  const reason = "Exit attempted without an open entry.";
  const movement: Movement = {
    id: `mv-${uid()}`,
    entryNo: `FL-${1000 + db().movements.length + 1}`,
    plate: known && normalizeId(known.plate) === plate ? known.plate : /^\d{12,}$/.test(plate) ? "" : plate,
    fastag: known && normalizeId(known.fastag) === plate ? known.fastag : /^\d{12,}$/.test(plate) ? plate : "",
    noFastag: false,
    vehicleClass: known?.vehicleClass ?? "",
    bank: "",
    driverName: known?.driverName ?? "Unknown",
    driverPhone: known?.driverPhone ?? "",
    vehicleType: known?.vehicleType ?? "Truck",
    transporter: known?.transporter ?? "",
    purpose: "Unloading",
    reference: "",
    remarks: "",
    entryAt: null,
    exitAt: null,
    status: "Flagged",
    operator,
    gate: activeGate(),
    createdAt: now,
    updatedAt: now,
    flag: { kind: "no-open-entry" as ExceptionKind, reason, at: now },
    audit: [{ at: now, by: operator, action: "Flagged for supervisor", note: reason }],
  };
  db().movements.unshift(movement);
  commit();
  return movement;
}

export function clearFlag(id: string, operator: string): Movement | null {
  const m = getMovement(id);
  if (!m?.flag || m.flag.clearedAt) return null;
  const now = Date.now();
  m.flag.clearedAt = now;
  m.flag.clearedBy = operator;
  m.updatedAt = now;
  m.audit.push({ at: now, by: operator, action: "Flag cleared" });
  commit();
  return m;
}

export { DAY, HOUR };

export type WeighResult = { ok: true; movement: Movement } | { ok: false; reason: string };

/** Records the next pass for a truck: gross first, tare second. Tare has to be lighter than gross. */
export function recordWeighment(
  id: string,
  input: { kg: number; source: "bridge" | "manual"; product: string; photo?: string },
  operator: string
): WeighResult {
  const m = getMovement(id);
  if (!m) return { ok: false, reason: "This vehicle is no longer on record." };
  if (!(input.kg > 0)) return { ok: false, reason: "Enter a weight above zero." };
  const stage = nextStage(m);
  if (!stage) return { ok: false, reason: "This truck has already been weighed twice." };
  const gross = m.weighments?.find((w) => w.stage === "gross");
  if (stage === "tare" && gross && input.kg >= gross.kg) {
    return { ok: false, reason: `Tare must be lighter than the gross weight of ${gross.kg.toLocaleString("en-IN")} kg.` };
  }
  const now = Date.now();
  (m.weighments ??= []).unshift({ stage, kg: input.kg, source: input.source, at: now, by: operator, product: input.product, photo: input.photo });
  m.updatedAt = now;
  m.audit.push({
    at: now,
    by: operator,
    action: stage === "gross" ? "Gross weighed" : "Tare weighed",
    note: `${input.product} · ${input.kg.toLocaleString("en-IN")} kg (${input.source === "bridge" ? "weight bridge" : "typed in"})`,
  });
  commit();
  return { ok: true, movement: m };
}
