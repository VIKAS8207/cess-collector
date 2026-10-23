import type { CessConfig } from "./trader-types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** CESS on one bill: % of goods value, or a flat amount per sale. */
export function computeCess(cfg: CessConfig, goods: number): number {
  if (!cfg.enabled || goods <= 0) return 0;
  return cfg.type === "percent" ? r2((goods * cfg.rate) / 100) : r2(cfg.rate);
}

/** Split a bill's CESS across its lines so the parts add up to the total exactly. */
export function splitCess(cfg: CessConfig, lineGoods: number[]): number[] {
  const goods = lineGoods.reduce((a, b) => a + b, 0);
  const total = computeCess(cfg, goods);
  if (total === 0 || goods === 0) return lineGoods.map(() => 0);
  const parts = lineGoods.map((g) => r2((total * g) / goods));
  const drift = r2(total - parts.reduce((a, b) => a + b, 0));
  parts[parts.length - 1] = r2(parts[parts.length - 1] + drift);
  return parts;
}

export function describeCess(cfg: CessConfig): string {
  if (!cfg.enabled) return "CESS is switched off";
  return cfg.type === "percent" ? `${cfg.rate}% of goods value` : `₹${cfg.rate} flat per sale`;
}

/** Proportional suggestion for splitting a payment into goods and cess parts. */
export function suggestSplit(amount: number, goodsDue: number, cessDue: number): { goods: number; cess: number } {
  const total = goodsDue + cessDue;
  if (amount <= 0 || total <= 0) return { goods: 0, cess: 0 };
  const cess = Math.min(cessDue, r2((amount * cessDue) / total));
  return { goods: r2(amount - cess), cess };
}

export { r2 };
