import type { CommissionSetting } from "./agent-types";

/** Commission for one sale line, from the buying party's stored setting. */
export function commissionFor(
  setting: Pick<CommissionSetting, "type" | "rate">,
  qty: number,
  amount: number
): { amount: number; label: string } {
  if (setting.type === "percent") {
    return {
      amount: Math.round(((amount * setting.rate) / 100) * 100) / 100,
      label: `${setting.rate}% of sale value`,
    };
  }
  if (setting.type === "flat") {
    return { amount: Math.round(qty * setting.rate * 100) / 100, label: `₹${setting.rate} per unit` };
  }
  return { amount: 0, label: "No commission" };
}

export function describeCommission(s: Pick<CommissionSetting, "type" | "rate">): string {
  if (s.type === "percent") return `${s.rate}% of sale value`;
  if (s.type === "flat") return `₹${s.rate}/unit`;
  return "No commission";
}

/** Parse a user-typed number; empty or invalid gives NaN. */
export function toNum(v: string): number {
  if (!v.trim()) return NaN;
  return Number(v.replace(/,/g, ""));
}
