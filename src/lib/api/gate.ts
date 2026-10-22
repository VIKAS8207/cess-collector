import { delay } from "./delay";
import { config, overstayMs } from "@/lib/domain/settings";
import { startOfDay } from "@/lib/domain/seed";
import type { Range } from "@/lib/domain/range";
import {
  DAY,
  HOUR,
  type EntryInput,
  type ExceptionItem,
  type Movement,
  type Purpose,
  type Status,
  type VehicleType,
} from "@/lib/domain/types";
import {
  allMovements,
  approveExit,
  attentionItems,
  clearFlag,
  createEntry,
  dwellOf,
  exceptionItems,
  flagNoEntry,
  normalizeId,
  openMovements,
  recentPlates,
  recordWeighment,
  type EntryResult,
} from "@/lib/domain/store";

/**
 * Async facade over the mock store. Every call waits 400-800 ms like a network
 * request; replace the bodies with fetch() calls when a backend exists.
 */
type Opts = { forceError?: boolean };

async function sim<T>(opts: Opts | undefined, run: () => T): Promise<T> {
  await delay();
  if (opts?.forceError) throw new Error("simulated failure");
  return run();
}

export function forcedErrors(): Set<string> {
  const raw = new URLSearchParams(window.location.search).get("error") ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

// ---------- shared helpers ----------

const refTime = (m: Movement) => m.entryAt ?? m.createdAt;

export type Filters = {
  range: Range;
  status?: Status;
  q?: string;
  type?: VehicleType;
  purpose?: Purpose;
};

export function filterMovements(f: Filters): Movement[] {
  const q = f.q?.trim() ?? "";
  const qId = normalizeId(q);
  const qText = q.toLowerCase();
  return allMovements().filter((m) => {
    const t = refTime(m);
    if (t < f.range.from || t >= f.range.to) return false;
    if (f.status && m.status !== f.status) return false;
    if (f.type && m.vehicleType !== f.type) return false;
    if (f.purpose && m.purpose !== f.purpose) return false;
    if (q) {
      const hit =
        (qId && (normalizeId(m.plate).includes(qId) || normalizeId(m.fastag).includes(qId))) ||
        m.driverName.toLowerCase().includes(qText);
      if (!hit) return false;
    }
    return true;
  });
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (cur: number | null, prev: number | null) =>
  cur === null || prev === null || prev === 0 ? null : ((cur - prev) / prev) * 100;

// ---------- dashboard ----------

export type DashboardKpis = {
  entriesToday: number;
  exitsToday: number;
  inside: number;
  avgDwellMs: number | null;
  deltas: { entries: number | null; exits: number | null; inside: number | null; dwell: number | null };
  exceptions: number;
};

export function getKpis(opts?: Opts): Promise<DashboardKpis> {
  return sim(opts, () => {
    const now = Date.now();
    const today = startOfDay(now);
    const yesterday = today - DAY;
    const all = allMovements();
    const entriesIn = (a: number, b: number) =>
      all.filter((m) => m.entryAt !== null && m.entryAt >= a && m.entryAt < b).length;
    const exitsList = (a: number, b: number) =>
      all.filter((m) => m.exitAt !== null && m.exitAt >= a && m.exitAt < b);
    const entriesToday = entriesIn(today, today + DAY);
    const entriesY = entriesIn(yesterday, today);
    const exitsT = exitsList(today, today + DAY);
    const exitsY = exitsList(yesterday, today);
    const avgT = avg(exitsT.map((m) => m.exitAt! - m.entryAt!));
    const avgY = avg(exitsY.map((m) => m.exitAt! - m.entryAt!));
    const insideNow = openMovements().length;
    const sameTimeYesterday = now - DAY;
    const insideY = all.filter(
      (m) => m.entryAt !== null && m.entryAt <= sameTimeYesterday && (m.exitAt === null || m.exitAt > sameTimeYesterday)
    ).length;
    return {
      entriesToday,
      exitsToday: exitsT.length,
      inside: insideNow,
      avgDwellMs: avgT,
      deltas: {
        entries: pct(entriesToday, entriesY),
        exits: pct(exitsT.length, exitsY.length),
        inside: pct(insideNow, insideY),
        dwell: pct(avgT, avgY),
      },
      exceptions: attentionItems(now).length,
    };
  });
}

export type Series = { labels: string[]; entries: number[]; exits: number[]; period: string };

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
const dayLabel = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

export function buildSeries(range: Range, movements: Movement[], unit?: "hour" | "day"): Series {
  const byHour = unit ? unit === "hour" : range.to - range.from <= DAY;
  const step = byHour ? HOUR : DAY;
  const buckets = Math.ceil((range.to - range.from) / step);
  const entries = new Array<number>(buckets).fill(0);
  const exits = new Array<number>(buckets).fill(0);
  const index = (t: number) => Math.floor((t - range.from) / step);
  for (const m of movements) {
    if (m.entryAt !== null && m.entryAt >= range.from && m.entryAt < range.to) entries[index(m.entryAt)]++;
    if (m.exitAt !== null && m.exitAt >= range.from && m.exitAt < range.to) exits[index(m.exitAt)]++;
  }
  const labels = Array.from({ length: buckets }, (_, i) =>
    byHour ? hourLabel(i % 24) : dayLabel.format(range.from + i * DAY)
  );
  return { labels, entries, exits, period: byHour ? "By hour" : "By day" };
}

export function getSeries(range: Range, opts?: Opts): Promise<Series> {
  return sim(opts, () => buildSeries(range, allMovements()));
}

export function getAttention(opts?: Opts): Promise<ExceptionItem[]> {
  return sim(opts, () => attentionItems(Date.now()).slice(0, 8));
}

export function getInside(opts?: Opts): Promise<Movement[]> {
  return sim(opts, () => openMovements());
}

export type ActivityEvent = {
  id: string;
  at: number;
  plate: string;
  fastag: string;
  kind: "Entry" | "Exit";
  operator: string;
  movementId: string;
};

export function getRecent(opts?: Opts): Promise<ActivityEvent[]> {
  return sim(opts, () => {
    const out: ActivityEvent[] = [];
    for (const m of allMovements()) {
      if (m.entryAt !== null)
        out.push({ id: `${m.id}-in`, at: m.entryAt, plate: m.plate, fastag: m.fastag, kind: "Entry", operator: m.operator, movementId: m.id });
      if (m.exitAt !== null)
        out.push({ id: `${m.id}-out`, at: m.exitAt, plate: m.plate, fastag: m.fastag, kind: "Exit", operator: m.exitOperator ?? m.operator, movementId: m.id });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 10);
  });
}

export function getTodayEntries(opts?: Opts): Promise<Movement[]> {
  return sim(opts, () => {
    const today = startOfDay(Date.now());
    return allMovements()
      .filter((m) => m.entryAt !== null && m.entryAt >= today)
      .sort((a, b) => b.entryAt! - a.entryAt!);
  });
}

// ---------- gate entry / exit ----------

let failNextSave = true;

export async function submitEntry(input: EntryInput, operator: string): Promise<EntryResult> {
  await delay();
  // Demo: reference "FAIL" simulates one server error so the retry path can be reviewed.
  if (input.reference.trim().toUpperCase() === "FAIL" && failNextSave) {
    failNextSave = false;
    throw new Error("simulated failure");
  }
  failNextSave = true;
  return createEntry(input, operator);
}

export async function submitExit(id: string, operator: string): Promise<Movement | null> {
  await delay();
  return approveExit(id, operator);
}

export async function submitFlag(plate: string, operator: string): Promise<Movement> {
  await delay();
  return flagNoEntry(plate, operator);
}

export async function submitClearFlag(id: string, operator: string): Promise<Movement | null> {
  await delay();
  return clearFlag(id, operator);
}

export type Lookup =
  | { kind: "exited"; movement: Movement }
  | { kind: "none" };

/** Used when nothing inside matches what the operator typed. */
export async function lookupClosed(query: string): Promise<Lookup> {
  await delay();
  const id = normalizeId(query);
  const found = allMovements().find(
    (m) => m.status === "Exited" && (normalizeId(m.plate) === id || normalizeId(m.fastag) === id)
  );
  return found ? { kind: "exited", movement: found } : { kind: "none" };
}

export function suggestionsFor(prefix: string): Movement[] {
  const id = normalizeId(prefix);
  const inside = new Set(openMovements().map((m) => normalizeId(m.plate)));
  return recentPlates()
    .filter((m) => !inside.has(normalizeId(m.plate)) && (!id || normalizeId(m.plate).startsWith(id)))
    .slice(0, 5);
}

// ---------- all vehicles ----------

export type Page<T> = { rows: T[]; total: number; page: number; pages: number; size: number };

export function listMovements(
  f: Filters,
  page: number,
  size: number,
  opts?: Opts
): Promise<Page<Movement>> {
  return sim(opts, () => {
    const rows = filterMovements(f).sort((a, b) => refTime(b) - refTime(a));
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const p = Math.min(Math.max(1, page), pages);
    return { rows: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pages, size };
  });
}

// ---------- reports ----------

export type Count = { label: string; count: number };

export type SummaryReport = {
  entries: number;
  exits: number;
  netInside: number;
  avgDwell: number | null;
  longest: { ms: number; plate: string } | null;
  peakHour: string | null;
  byType: Count[];
  byPurpose: Count[];
  series: Series;
};

export type DwellReport = {
  rows: Movement[];
  daily: { label: string; value: number }[];
  overstays: Movement[];
  buckets: Count[];
  avg: number | null;
};

export type ReportData =
  | { kind: "summary"; data: SummaryReport }
  | { kind: "log"; rows: Movement[]; avgDwell: number | null }
  | { kind: "dwell"; data: DwellReport }
  | { kind: "exceptions"; rows: ExceptionItem[] };

export type ReportKind = ReportData["kind"];

function tally(values: string[]): Count[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function getReport(kind: ReportKind, f: Filters, opts?: Opts): Promise<ReportData> {
  return sim(opts, (): ReportData => {
    const now = Date.now();
    const rows = filterMovements(f).filter((m) => m.status !== "Flagged" || kind === "log");
    const closed = rows.filter((m) => m.entryAt !== null && m.exitAt !== null);
    const dwells = closed.map((m) => m.exitAt! - m.entryAt!);

    if (kind === "summary") {
      const hours = new Array<number>(24).fill(0);
      for (const m of rows) if (m.entryAt !== null) hours[new Date(m.entryAt).getHours()]++;
      const peak = Math.max(...hours);
      const longest = closed.reduce<Movement | null>(
        (a, m) => (!a || m.exitAt! - m.entryAt! > a.exitAt! - a.entryAt! ? m : a),
        null
      );
      return {
        kind,
        data: {
          entries: rows.filter((m) => m.entryAt !== null && m.entryAt >= f.range.from && m.entryAt < f.range.to).length,
          exits: rows.filter((m) => m.exitAt !== null && m.exitAt >= f.range.from && m.exitAt < f.range.to).length,
          netInside: rows.filter((m) => m.status === "Inside").length,
          avgDwell: avg(dwells),
          longest: longest ? { ms: longest.exitAt! - longest.entryAt!, plate: longest.plate } : null,
          peakHour: peak > 0 ? `${hourLabel(hours.indexOf(peak))} (${peak} entries)` : null,
          byType: tally(rows.map((m) => m.vehicleType)),
          byPurpose: tally(rows.map((m) => m.purpose)),
          series: buildSeries(f.range, rows),
        },
      };
    }

    if (kind === "log") {
      const sorted = rows.sort((a, b) => refTime(b) - refTime(a));
      return { kind, rows: sorted, avgDwell: avg(dwells) };
    }

    if (kind === "dwell") {
      const withDwell = rows
        .filter((m) => m.entryAt !== null)
        .sort((a, b) => dwellOf(b, now)! - dwellOf(a, now)!);
      const days = new Map<number, number[]>();
      for (const m of closed) {
        const d = startOfDay(m.entryAt!);
        days.set(d, [...(days.get(d) ?? []), m.exitAt! - m.entryAt!]);
      }
      const daily = [...days]
        .sort((a, b) => a[0] - b[0])
        .map(([d, v]) => ({ label: dayLabel.format(d), value: (avg(v) ?? 0) / HOUR }));
      const edges: [string, number, number][] = [
        ["Under 1 h", 0, HOUR],
        ["1-2 h", HOUR, 2 * HOUR],
        ["2-4 h", 2 * HOUR, 4 * HOUR],
        ["4-8 h", 4 * HOUR, overstayMs()],
        [`Over ${config.overstayHours} h`, overstayMs(), Infinity],
      ];
      const buckets = edges.map(([label, lo, hi]) => ({
        label,
        count: withDwell.filter((m) => {
          const d = dwellOf(m, now)!;
          return d >= lo && d < hi;
        }).length,
      }));
      return {
        kind,
        data: {
          rows: withDwell.slice(0, 100),
          daily,
          overstays: withDwell.filter((m) => dwellOf(m, now)! > overstayMs()),
          buckets,
          avg: avg(dwells),
        },
      };
    }

    const items = exceptionItems(now).filter((i) => i.at >= f.range.from && i.at < f.range.to);
    const ids = new Set(filterMovements(f).map((m) => m.id));
    return {
      kind: "exceptions",
      rows: items.filter((i) => !i.movementId || ids.has(i.movementId) || !f.type),
    };
  });
}

// ---------- gate cameras ----------

/** Latest visit of a known vehicle, found by plate or FASTag. Used to pre-fill driver and trip details. */
export function knownVehicle(by: { plate?: string; fastag?: string }): Movement | undefined {
  const p = normalizeId(by.plate ?? "");
  const t = normalizeId(by.fastag ?? "");
  return allMovements().find((m) => (p && normalizeId(m.plate) === p) || (t && normalizeId(m.fastag) === t));
}

const plateLetters = "ABCDEFGHJKLMNPRSTUVWXYZ";

/**
 * Stand-in for the camera reader. A real plate or FASTag reader plugs in here
 * and returns the text it recognised from the captured frame.
 */
export async function readCamera(kind: "plate" | "fastag"): Promise<string> {
  await delay(700, 1100);
  const known = suggestionsFor("");
  const pickKnown = known.length > 0 && Math.random() < 0.7;
  const one = known[Math.floor(Math.random() * known.length)];
  if (kind === "plate") {
    if (pickKnown) return one.plate;
    const l = () => plateLetters[Math.floor(Math.random() * plateLetters.length)];
    const d = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
    return `MH${d(2)}${l()}${l()}${d(4)}`;
  }
  if (pickKnown && one.fastag) return one.fastag;
  return `3416${Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("")}`;
}

export type VehicleDetails = { vehicleType: VehicleType; vehicleClass: string; bank: string };

const classByType: Record<VehicleType, string> = {
  Truck: "Class 5 · Truck (3 axle)",
  Trailer: "Class 7 · Truck (7+ axle)",
  Tanker: "Class 6 · Truck (4-6 axle)",
  Container: "Class 6 · Truck (4-6 axle)",
  Pickup: "Class 4 · Truck (2 axle)",
};
const issuers = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "IDFC FIRST Bank", "Paytm Payments Bank"];
const typeCycle: VehicleType[] = ["Truck", "Truck", "Truck", "Trailer", "Tanker", "Container", "Container", "Pickup"];

/**
 * Stand-in for the registration and FASTag registry lookups. A known vehicle returns what was
 * seen on its last visit; any other plate or tag gets stable details derived from the number.
 */
export function vehicleDetailsFor(by: { plate?: string; fastag?: string }): VehicleDetails | null {
  const plate = normalizeId(by.plate ?? "");
  const tag = normalizeId(by.fastag ?? "");
  if (!plate && !tag) return null;
  const known = knownVehicle(by);
  if (known) return { vehicleType: known.vehicleType, vehicleClass: known.vehicleClass, bank: known.bank };
  let h = 0;
  for (const c of plate + tag) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const vehicleType = typeCycle[h % typeCycle.length];
  return { vehicleType, vehicleClass: classByType[vehicleType], bank: issuers[(h >>> 3) % issuers.length] };
}

/** Test helper behind the "Simulate" button: a plate and FASTag that are not inside right now. */
export async function simulateArrival(): Promise<{ plate: string; fastag: string }> {
  await delay(500, 900);
  const open = new Set(allMovements().filter((m) => m.status === "Inside").flatMap((m) => [normalizeId(m.plate), normalizeId(m.fastag)]));
  const past = allMovements().filter((m) => m.status === "Exited" && m.plate && m.fastag && !open.has(normalizeId(m.plate)) && !open.has(normalizeId(m.fastag)));
  if (past.length > 0 && Math.random() < 0.6) {
    const one = past[Math.floor(Math.random() * past.length)];
    return { plate: one.plate, fastag: one.fastag };
  }
  const l = () => plateLetters[Math.floor(Math.random() * plateLetters.length)];
  const d = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
  return { plate: `MH${d(2)}${l()}${l()}${d(4)}`, fastag: `3416${d(14)}` };
}

// ---------- exit by QR scan ----------

export type ScanLookup =
  | { kind: "inside"; movement: Movement }
  | { kind: "exited"; movement: Movement }
  | { kind: "none"; code: string };

/** The text on an entry QR is `SAS-GATE|<entry no>|<plate>|<time>`. Plain entry numbers, plates and FASTags work too. */
export function parseScan(raw: string): string {
  const t = raw.trim();
  return t.startsWith("SAS-GATE|") ? (t.split("|")[1] ?? t) : t;
}

export async function lookupScan(raw: string): Promise<ScanLookup> {
  await delay(300, 600);
  const code = parseScan(raw);
  const id = normalizeId(code);
  const match = (m: Movement) =>
    m.entryNo.toUpperCase() === code.toUpperCase() || (id !== "" && (normalizeId(m.plate) === id || normalizeId(m.fastag) === id));
  const all = allMovements();
  const open = all.find((m) => m.status === "Inside" && match(m));
  if (open) return { kind: "inside", movement: open };
  const done = all.find((m) => m.status === "Exited" && match(m));
  if (done) return { kind: "exited", movement: done };
  return { kind: "none", code: code.toUpperCase() };
}

// ---------- weight bridge ----------

export async function submitWeighment(id: string, input: { kg: number; source: "bridge" | "manual"; product: string; photo?: string }, operator: string) {
  await delay();
  return recordWeighment(id, input, operator);
}

/** Vehicles that have at least one weighment, latest weighing first. */
export function getWeighments(opts?: Opts): Promise<Movement[]> {
  return sim(opts, () =>
    allMovements()
      .filter((m) => (m.weighments?.length ?? 0) > 0)
      .sort((a, b) => b.weighments![0].at - a.weighments![0].at)
      .slice(0, 200)
  );
}
