import { createStore } from "@/lib/storage-store";

export const roles = [
  { id: "gate_operator", label: "Gate operator" },
  { id: "commission_agent", label: "Commission agent" },
  { id: "weighbridge_operator", label: "Weight bridge operator" },
  { id: "marketplace", label: "Market place" },
  { id: "driver", label: "Driver" },
  { id: "trader", label: "Trader" },
  { id: "admin", label: "Admin" },
] as const;

export type RoleId = (typeof roles)[number]["id"];

export const DEFAULT_ROLE: RoleId = "gate_operator";

/** Role chosen on the login page; remembered between visits. */
export const roleStore = createStore("sas:login-role", "local");

export function parseRole(raw: string | null | undefined): RoleId {
  return roles.find((r) => r.id === raw)?.id ?? DEFAULT_ROLE;
}

export function roleLabel(id: RoleId): string {
  return roles.find((r) => r.id === id)?.label ?? roles[0].label;
}
