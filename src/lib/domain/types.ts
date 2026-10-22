export const GATE = "Gate 1";
/** Inside longer than this counts as an over-stay (exception). */
export const OVERSTAY_MS = 8 * 3_600_000;
/** Inside longer than this (but under OVERSTAY_MS) is shown as a long stay. */
export const LONG_STAY_MS = 4 * 3_600_000;

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const vehicleTypes = ["Truck", "Trailer", "Tanker", "Container", "Pickup"] as const;
export const purposes = ["Loading", "Unloading"] as const;
export const statuses = ["Inside", "Exited", "Flagged"] as const;

export type VehicleType = (typeof vehicleTypes)[number];
export type Purpose = (typeof purposes)[number];
export type Status = (typeof statuses)[number];

export type ExceptionKind =
  | "no-open-entry"
  | "over-stay"
  | "duplicate-attempt"
  | "conflict";

export const exceptionLabels: Record<ExceptionKind, string> = {
  "no-open-entry": "Exit without entry",
  "over-stay": "Over-stay",
  "duplicate-attempt": "Duplicate entry blocked",
  conflict: "Plate / FASTag conflict",
};

export type AuditEntry = { at: number; by: string; action: string; note?: string };

export type WeighStage = "gross" | "tare";

/** One pass over the weight bridge. Gross is the loaded truck, tare is the same truck empty after delivery. */
export type Weighment = {
  stage: WeighStage;
  kg: number;
  source: "bridge" | "manual";
  at: number;
  by: string;
  product: string;
  /** Photo taken at the bridge, as a small data URL. */
  photo?: string;
};

export const stageLabel: Record<WeighStage, string> = { gross: "Gross", tare: "Tare" };

/** First pass is gross, second is tare, then the truck is done. */
export function nextStage(m: Pick<Movement, "weighments">): WeighStage | null {
  const n = m.weighments?.length ?? 0;
  return n === 0 ? "gross" : n === 1 ? "tare" : null;
}

export function weighSummary(m: Pick<Movement, "weighments">) {
  const gross = m.weighments?.find((w) => w.stage === "gross");
  const tare = m.weighments?.find((w) => w.stage === "tare");
  return { gross, tare, net: gross && tare ? gross.kg - tare.kg : null, product: gross?.product ?? tare?.product ?? "" };
}

export type Movement = {
  id: string;
  entryNo: string;
  plate: string;
  fastag: string;
  noFastag: boolean;
  vehicleClass: string;
  bank: string;
  driverName: string;
  driverPhone: string;
  vehicleType: VehicleType;
  transporter: string;
  purpose: Purpose;
  reference: string;
  remarks: string;
  entryAt: number | null;
  exitAt: number | null;
  status: Status;
  operator: string;
  exitOperator?: string;
  gate: string;
  createdAt: number;
  updatedAt: number;
  flag?: {
    kind: ExceptionKind;
    reason: string;
    at: number;
    clearedAt?: number;
    clearedBy?: string;
  };
  audit: AuditEntry[];
  /** Weights taken on the weight bridge (or typed in) while the truck was inside. */
  weighments?: Weighment[];
};

export type ExceptionEvent = {
  id: string;
  kind: ExceptionKind;
  at: number;
  plate: string;
  fastag: string;
  reason: string;
  operator: string;
  gate: string;
  movementId?: string;
};

/** One row in the "Needs attention" list and the Exceptions report. */
export type ExceptionItem = {
  id: string;
  kind: ExceptionKind;
  at: number;
  plate: string;
  fastag: string;
  reason: string;
  movementId?: string;
  resolved: boolean;
};

export type EntryInput = {
  plate: string;
  fastag: string;
  noFastag: boolean;
  vehicleClass: string;
  bank: string;
  driverName: string;
  driverPhone: string;
  vehicleType: VehicleType;
  transporter: string;
  purpose: Purpose;
  reference: string;
  remarks: string;
};
