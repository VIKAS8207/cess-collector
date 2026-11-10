import { commit, allMovements, normalizeId } from "./store";
import { startOfDay } from "./seed";
import { DAY, weighSummary, type Movement } from "./types";
import type { Unit } from "./agent-types";
import type { SupplierRecord } from "./admin-types";
import { allSuppliers } from "./supplier-store";

const HOURS = 3_600_000;

/**
 * A supplier telling the market "this truck is coming": the vehicle, driver,
 * goods, quantity and what the goods cost. The gate never edits it. Whether the
 * truck has arrived is worked out from the gate entries, so it is always current.
 */
export type Dispatch = {
  id: string;
  no: string;
  supplierId: string;
  supplierName: string;
  plate: string;
  driverName: string;
  driverPhone: string;
  transporter: string;
  commodity: string;
  quantity: number;
  unit: Unit;
  /** What the goods cost, in rupees. */
  value: number;
  notes: string;
  createdAt: number;
  /** Set by the supplier when the truck never came. Ignored once it is scanned at the gate. */
  notReachedAt?: number;
  notReachedReason?: string;
};

export type DispatchInput = Omit<Dispatch, "id" | "no" | "createdAt" | "notReachedAt" | "notReachedReason">;

export type GateState = "expected" | "inside" | "weighed" | "left" | "not_reached";

export const gateStateLabel: Record<GateState, string> = {
  expected: "On the way",
  inside: "Scanned at gate",
  weighed: "Weighed",
  left: "Left the gate",
  not_reached: "Not reached",
};

/** Scanned at the gate at least once, so the dispatch is history and can only be viewed. */
export const hasArrived = (s: GateState) => s === "inside" || s === "weighed" || s === "left";

export type GateStatus = {
  state: GateState;
  entryNo?: string;
  entryAt?: number | null;
  exitAt?: number | null;
  netKg?: number | null;
  gate?: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);

let rows: Dispatch[] | null = null;
let counter = 0;
const nextNo = () => `DSP-${String(++counter).padStart(4, "0")}`;

function seed(): Dispatch[] {
  const now = Date.now();
  const today = startOfDay(now);
  const suppliers = allSuppliers();
  const out: Omit<Dispatch, "no">[] = [];
  const sizes: [number, Unit][] = [[40, "bags"], [60, "bags"], [25, "quintal"], [8, "tonnes"], [120, "bags"], [900, "kg"]];
  const rates = [1800, 2400, 3100, 4200, 2000, 56];
  const drivers: [string, string][] = [
    ["Ramesh Yadav", "9822011100"],
    ["Suresh Jadhav", "9822011101"],
    ["Mohan Pawar", "9822011102"],
    ["Imtiaz Shaikh", "9822011103"],
    ["Dinesh Rathod", "9822011104"],
  ];
  const make = (s: SupplierRecord, i: number, plate: string, driver: [string, string], createdAt: number, transporter = ""): Omit<Dispatch, "no"> => {
    const [qty, unit] = sizes[i % sizes.length];
    return {
      id: `dsp-${uid()}`,
      supplierId: s.id,
      supplierName: s.name,
      plate,
      driverName: driver[0],
      driverPhone: driver[1],
      transporter,
      commodity: s.commodities[i % s.commodities.length],
      quantity: qty,
      unit,
      value: Math.round(qty * rates[i % rates.length]),
      notes: i % 4 === 0 ? "Handle with care, loose packing." : "",
      createdAt,
    };
  };

  // Reached: tie each dispatch to a real gate entry, so its status is genuine.
  const seen = new Set<string>();
  const moves = allMovements()
    .filter((m) => m.entryAt !== null && m.plate)
    .sort((a, b) => (b.entryAt ?? 0) - (a.entryAt ?? 0));
  let n = 0;
  for (const m of moves) {
    const key = normalizeId(m.plate);
    if (seen.has(key) || n >= suppliers.length * 6) continue;
    seen.add(key);
    const s = suppliers[n % suppliers.length];
    const d = make(s, n, m.plate, [m.driverName, m.driverPhone], (m.entryAt ?? now) - (2 + (n % 4)) * HOURS, m.transporter);
    m.supplier = s.name;
    m.commodity = d.commodity;
    out.push(d);
    n += 1;
  }

  suppliers.forEach((s, si) => {
    // On the way: registered vehicles that have not reached yet.
    s.plates.slice(0, 2).forEach((plate, k) => {
      if (seen.has(normalizeId(plate))) return;
      out.push(make(s, si + k + 3, plate, drivers[(si + k) % drivers.length], now - (1 + k) * HOURS, k ? "" : `${s.name.split(" ")[1] ?? s.name} Transport`));
    });
    // Not reached: trucks that never came.
    for (let k = 0; k < 2; k += 1) {
      const plate = `${["MH", "KA", "GJ"][si % 3]}${10 + si}${["XY", "ZT"][k]}${4410 + si * 17 + k * 91}`;
      const createdAt = today - (3 + k * 5 + si) * DAY + 9 * HOURS;
      out.push({ ...make(s, si + k + 1, plate, drivers[(si + k + 2) % drivers.length], createdAt), notReachedAt: createdAt + DAY, notReachedReason: k ? "Truck broke down on the way." : "Sale postponed." });
    }
  });

  return out
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((d) => ({ ...d, no: nextNo() }))
    .reverse();
}

export const allDispatches = () => (rows ??= seed());
export const getDispatch = (id: string) => allDispatches().find((d) => d.id === id);

/** Dispatches belonging to one supplier. Seed rows have no id yet, so they match by name. */
export const dispatchesOf = (supplierId: string, supplierName: string) =>
  allDispatches().filter((d) => (d.supplierId ? d.supplierId === supplierId : d.supplierName === supplierName));

/**
 * Where a dispatch is at the gate: the newest gate entry for its plate made after
 * the dispatch was created. Weighed and left follow from that entry.
 */
export function gateStatusOf(d: Dispatch): GateStatus {
  const key = normalizeId(d.plate);
  const m: Movement | undefined = allMovements()
    .filter((x) => x.entryAt !== null && x.entryAt >= d.createdAt && normalizeId(x.plate) === key)
    .sort((a, b) => (b.entryAt ?? 0) - (a.entryAt ?? 0))[0];
  if (!m) return { state: d.notReachedAt ? "not_reached" : "expected" };
  const w = weighSummary(m);
  const state: GateState = m.status === "Exited" ? "left" : w.gross ? "weighed" : "inside";
  return { state, entryNo: m.entryNo, entryAt: m.entryAt, exitAt: m.exitAt, netKg: w.net, gate: m.gate };
}

/** The newest dispatch for a plate that has not reached the gate yet. */
export function pendingDispatchFor(plate: string): Dispatch | undefined {
  const key = normalizeId(plate);
  if (!key) return undefined;
  return allDispatches()
    .filter((d) => normalizeId(d.plate) === key && gateStatusOf(d).state === "expected")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

const clean = (i: DispatchInput): DispatchInput => ({
  ...i,
  plate: normalizeId(i.plate),
  driverName: i.driverName.trim(),
  driverPhone: i.driverPhone.replace(/[\s-]/g, ""),
  transporter: i.transporter.trim(),
  commodity: i.commodity.trim(),
  notes: i.notes.trim(),
});

export function addDispatch(input: DispatchInput): Dispatch {
  const d: Dispatch = { ...clean(input), id: `dsp-${uid()}`, no: nextNo(), createdAt: Date.now() };
  allDispatches().unshift(d);
  commit();
  return d;
}

export function updateDispatch(id: string, input: DispatchInput): Dispatch | null {
  const d = getDispatch(id);
  if (!d) return null;
  Object.assign(d, clean(input));
  commit();
  return d;
}

export function markNotReached(id: string, reason: string): Dispatch | null {
  const d = getDispatch(id);
  if (!d) return null;
  d.notReachedAt = Date.now();
  d.notReachedReason = reason.trim();
  commit();
  return d;
}

export function reopenDispatch(id: string): Dispatch | null {
  const d = getDispatch(id);
  if (!d) return null;
  delete d.notReachedAt;
  delete d.notReachedReason;
  commit();
  return d;
}

export function deleteDispatch(id: string): boolean {
  const list = allDispatches();
  const i = list.findIndex((d) => d.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  commit();
  return true;
}
