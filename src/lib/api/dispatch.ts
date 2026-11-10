import { delay } from "./delay";
import { startOfDay } from "@/lib/domain/seed";
import { findUserByEmail } from "@/lib/domain/admin-store";
import { allSuppliers } from "@/lib/domain/supplier-store";
import type { SupplierRecord } from "@/lib/domain/admin-types";
import {
  addDispatch,
  dispatchesOf,
  gateStateLabel,
  gateStatusOf,
  getDispatch,
  hasArrived,
  markNotReached,
  reopenDispatch,
  updateDispatch,
  type Dispatch,
  type DispatchInput,
  type GateState,
  type GateStatus,
} from "@/lib/domain/dispatch-store";
import type { DeleteResult } from "./admin";

export type DispatchRow = Dispatch & { gate: GateStatus };

/** The supplier record behind a login: by the linked user id, then by name. */
export function supplierForLogin(email: string, name: string): SupplierRecord | undefined {
  const u = findUserByEmail(email);
  const all = allSuppliers();
  return (u && all.find((s) => s.userId === u.id)) || all.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
}

export async function getDispatches(supplier: SupplierRecord, q: string): Promise<DispatchRow[]> {
  await delay(200, 400);
  const text = q.trim().toLowerCase();
  return dispatchesOf(supplier.id, supplier.name)
    .map((d) => ({ ...d, gate: gateStatusOf(d) }))
    .filter(
      (r) =>
        !text ||
        r.plate.toLowerCase().includes(text) ||
        r.driverName.toLowerCase().includes(text) ||
        r.commodity.toLowerCase().includes(text) ||
        r.no.toLowerCase().includes(text) ||
        gateStateLabel[r.gate.state].toLowerCase().includes(text)
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function submitCreateDispatch(input: DispatchInput) {
  await delay();
  return addDispatch(input);
}

const LOCKED = "This dispatch can no longer be changed. Trucks that reached the gate, or were marked not reached, are kept as a record.";

export async function submitUpdateDispatch(id: string, input: DispatchInput): Promise<DeleteResult> {
  await delay();
  const d = getDispatch(id);
  if (!d) return { ok: false, reason: "This dispatch no longer exists." };
  if (gateStatusOf(d).state !== "expected") return { ok: false, reason: LOCKED };
  updateDispatch(id, input);
  return { ok: true };
}

/** A dispatch is a record, so it is never deleted. A truck that did not come is marked instead. */
export async function submitMarkNotReached(id: string, reason: string): Promise<DeleteResult> {
  await delay(300, 500);
  const d = getDispatch(id);
  if (!d) return { ok: false, reason: "This dispatch no longer exists." };
  if (hasArrived(gateStatusOf(d).state)) return { ok: false, reason: "This truck was scanned at the gate, so it did reach." };
  markNotReached(id, reason);
  return { ok: true };
}

export async function submitReopenDispatch(id: string): Promise<DeleteResult> {
  await delay(300, 500);
  if (!reopenDispatch(id)) return { ok: false, reason: "This dispatch no longer exists." };
  return { ok: true };
}

export type DispatchSummary = {
  total: number;
  onTheWay: number;
  reached: number;
  notReached: number;
  /** Quantity per unit, e.g. 120 bags and 40 kg. */
  quantity: { unit: string; qty: number }[];
  value: number;
  /** Value of the trucks that were scanned at the gate. */
  valueReached: number;
};

export function summarize(rows: DispatchRow[]): DispatchSummary {
  const qty = new Map<string, number>();
  for (const r of rows) qty.set(r.unit, (qty.get(r.unit) ?? 0) + r.quantity);
  const reached = rows.filter((r) => hasArrived(r.gate.state));
  return {
    total: rows.length,
    onTheWay: rows.filter((r) => r.gate.state === "expected").length,
    reached: reached.length,
    notReached: rows.filter((r) => r.gate.state === "not_reached").length,
    quantity: [...qty].map(([unit, q]) => ({ unit, qty: q })),
    value: rows.reduce((s, r) => s + r.value, 0),
    valueReached: reached.reduce((s, r) => s + r.value, 0),
  };
}

export type GoodsRow = { commodity: string; trucks: number; reached: number; quantity: { unit: string; qty: number }[]; value: number };

export type SupplierReport = {
  rows: DispatchRow[];
  summary: DispatchSummary;
  byGoods: GoodsRow[];
  /** Cost sent per day, oldest first. */
  byDay: { label: string; value: number }[];
};

const dayLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

/** Dispatches created in the range, with the totals the supplier report shows. */
export async function getSupplierReport(
  supplier: SupplierRecord,
  f: { from: number; to: number; state: GateState | "" }
): Promise<SupplierReport> {
  await delay(250, 450);
  const rows = dispatchesOf(supplier.id, supplier.name)
    .filter((d) => d.createdAt >= f.from && d.createdAt < f.to)
    .map((d) => ({ ...d, gate: gateStatusOf(d) }))
    .filter((r) => !f.state || r.gate.state === f.state)
    .sort((a, b) => b.createdAt - a.createdAt);

  const goods = new Map<string, DispatchRow[]>();
  for (const r of rows) goods.set(r.commodity, [...(goods.get(r.commodity) ?? []), r]);
  const byGoods = [...goods]
    .map(([commodity, list]) => {
      const s = summarize(list);
      return { commodity, trucks: list.length, reached: s.reached, quantity: s.quantity, value: s.value };
    })
    .sort((a, b) => b.value - a.value);

  const days = new Map<number, number>();
  for (const r of rows) {
    const day = startOfDay(r.createdAt);
    days.set(day, (days.get(day) ?? 0) + r.value);
  }
  const byDay = [...days].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({ label: dayLabel.format(t), value }));

  return { rows, summary: summarize(rows), byGoods, byDay };
}
