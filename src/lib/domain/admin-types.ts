import type { RoleId } from "@/lib/roles";
import type { Unit } from "./agent-types";

export type UserStatus = "active" | "inactive";
export type ResetState = "none" | "otp_sent" | "cleared";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  status: UserStatus;
  createdAt: number;
  createdBy: string;
  lastLoginAt: number | null;
  resetState: ResetState;
  /** Mock only. A real system never stores or shows a password. */
  password: string;
};

export type MasterKind = "items" | "vehicleTypes" | "purposes" | "paymentModes";

export type MasterEntry = {
  id: string;
  kind: MasterKind;
  label: string;
  defaultUnit?: Unit;
  active: boolean;
};

export type AuditCategory = "settings" | "users" | "masters";

/** Append-only. Nothing in the app edits or removes an entry. */
export type AuditEntry = {
  id: string;
  at: number;
  admin: string;
  category: AuditCategory;
  entity: string;
  entityLabel: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  href?: string;
};

export type OtpRecord = { code: string; sentAt: number; revoked: boolean; attempts: number };

export type ActivityType =
  | "gate_entry"
  | "gate_exit"
  | "weighment"
  | "receipt"
  | "sale"
  | "return"
  | "payment"
  | "settings"
  | "users"
  | "masters";

export const activityTypes: { value: ActivityType; label: string }[] = [
  { value: "gate_entry", label: "Gate entry" },
  { value: "gate_exit", label: "Gate exit" },
  { value: "weighment", label: "Weighment" },
  { value: "receipt", label: "Receipt" },
  { value: "sale", label: "Sale" },
  { value: "return", label: "Return" },
  { value: "payment", label: "Payment" },
  { value: "settings", label: "Settings" },
  { value: "users", label: "Users" },
  { value: "masters", label: "Masters" },
];

export type ActivityEvent = {
  id: string;
  at: number;
  role: RoleId;
  user: string;
  type: ActivityType;
  summary: string;
  ref: string;
  payload: [string, string][];
  oldValue?: string;
  newValue?: string;
  href?: string;
};
