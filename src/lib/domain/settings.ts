/**
 * System settings owned by the Admin role. Other roles only read them.
 * This file has no imports so any store can use it without a cycle.
 */
export type CessSettings = {
  enabled: boolean;
  type: "percent" | "flat";
  rate: number;
  since: number;
  lastChangedBy: string;
  lastChangedAt: number;
};

export type Gate = { id: string; name: string; active: boolean };

export type BusinessInfo = { name: string; address: string; city: string; phone: string };

export const config = {
  overstayHours: 8,
  overdueDays: 7,
  otpCooldownSeconds: 60,
  /** Fixed. Shown to the admin as a note, not editable. */
  retentionDays: 90,
  cess: {
    enabled: true,
    type: "percent",
    rate: 2,
    since: 0,
    lastChangedBy: "System",
    lastChangedAt: 0,
  } as CessSettings,
  gates: [{ id: "gate-1", name: "Gate 1", active: true }] as Gate[],
  business: {
    name: "CESS Collector Agro Market",
    address: "Plot 14, APMC Market Yard",
    city: "Pune",
    phone: "020 5550 1400",
  } as BusinessInfo,
};

export const overstayMs = () => config.overstayHours * 3_600_000;
export const overdueDays = () => config.overdueDays;
export const otpCooldownMs = () => config.otpCooldownSeconds * 1000;
export const retentionMs = () => config.retentionDays * 86_400_000;

/** Gate stamped on new gate records: the first active gate. */
export const activeGate = () => config.gates.find((g) => g.active)?.name ?? config.gates[0]?.name ?? "Gate 1";
export const cessSettings = () => config.cess;
export const businessInfo = () => config.business;
