const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const int = new Intl.NumberFormat("en-US");

export const formatCurrency = (n: number) => usd.format(n);
export const formatCompactCurrency = (n: number) => usdCompact.format(n);
export const formatNumber = (n: number) => int.format(n);
export const formatPercent = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
export const formatDelta = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(1)}%`;

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFull = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
export const formatTime = (t: number) => time.format(t);
export const formatDate = (t: number) => dateOnly.format(t);
export const formatStamp = (t: number) => dateTimeFull.format(t);

/** 134 minutes -> "2 h 14 m". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Indian digit grouping, e.g. 12,34,567. Shows paise only when present. */
export const formatInr = (n: number) =>
  Math.abs(n - Math.round(n)) < 0.005 ? inr.format(Math.round(n)) : inrExact.format(n);
export const formatQty = (n: number) => qty.format(n);

const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
/** Short rupee text for chart axes, e.g. ₹1.2L. */
export const formatCompactInr = (n: number) => inrCompact.format(n);
