import { DAY } from "./types";
import { startOfDay } from "./seed";

export type RangePreset = "today" | "7d" | "30d" | "custom";

export const rangePresets: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

export type Range = { from: number; to: number };

/** `to` is exclusive (start of the day after the last included day). */
export function resolveRange(
  preset: RangePreset,
  now: number,
  custom?: { from?: string; to?: string }
): Range {
  const today = startOfDay(now);
  if (preset === "today") return { from: today, to: today + DAY };
  if (preset === "7d") return { from: today - 6 * DAY, to: today + DAY };
  if (preset === "30d") return { from: today - 29 * DAY, to: today + DAY };
  const from = custom?.from ? parseDay(custom.from) : today - 6 * DAY;
  const to = custom?.to ? parseDay(custom.to) + DAY : today + DAY;
  return { from, to: Math.max(to, from + DAY) };
}

export function parseDay(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export function toDayInput(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const dayFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
export function describeRange(range: Range): string {
  const last = range.to - DAY;
  if (last <= range.from) return dayFmt.format(range.from);
  return `${dayFmt.format(range.from)} - ${dayFmt.format(last)}`;
}
