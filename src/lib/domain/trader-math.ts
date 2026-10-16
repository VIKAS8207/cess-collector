import type { SaasConfig } from "./trader-types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saas on one bill: % of goods value, or a flat amount per sale. */
export function computeSaas(cfg: SaasConfig, goods: number): number {
  if (!cfg.enabled || goods <= 0) return 0;
  return cfg.type === "percent" ? r2((goods * cfg.rate) / 100) : r2(cfg.rate);
}

/** Split a bill's saas across its lines so the parts add up to the total exactly. */
export function splitSaas(cfg: SaasConfig, lineGoods: number[]): number[] {
  const goods = lineGoods.reduce((a, b) => a + b, 0);
  const total = computeSaas(cfg, goods);
  if (total === 0 || goods === 0) return lineGoods.map(() => 0);
  const parts = lineGoods.map((g) => r2((total * g) / goods));
  const drift = r2(total - parts.reduce((a, b) => a + b, 0));
  parts[parts.length - 1] = r2(parts[parts.length - 1] + drift);
  return parts;
}

export function describeSaas(cfg: SaasConfig): string {
  if (!cfg.enabled) return "Saas is switched off";
  return cfg.type === "percent" ? `${cfg.rate}% of goods value` : `₹${cfg.rate} flat per sale`;
}

/** Proportional suggestion for splitting a payment into goods and saas parts. */
export function suggestSplit(amount: number, goodsDue: number, saasDue: number): { goods: number; saas: number } {
  const total = goodsDue + saasDue;
  if (amount <= 0 || total <= 0) return { goods: 0, saas: 0 };
  const saas = Math.min(saasDue, r2((amount * saasDue) / total));
  return { goods: r2(amount - saas), saas };
}

export { r2 };
