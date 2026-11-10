import { commit } from "./store";
import { startOfDay } from "./seed";
import { DAY } from "./types";
import { allSuppliers } from "./supplier-store";
import { pendingDispatchFor } from "./dispatch-store";

/** Roles that register a business profile before the login is created. */
export type ProfileRoleId = "commission_agent" | "weighbridge_operator" | "marketplace" | "driver" | "trader";

export type FieldKind = "text" | "tel" | "number" | "date" | "select" | "textarea";

export type ProfileField = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** Upper-case the value on save (plates, GSTIN, licence numbers). */
  upper?: boolean;
  /** Extra check, run only when the value is not empty. Return an error message. */
  check?: (value: string) => string | undefined;
  /** Show this field as a column in the roster table. */
  column?: boolean;
  min?: number;
  max?: number;
};

export type ProfileSection = { title: string; hint?: string; fields: ProfileField[] };

export type RoleProfileConfig = {
  /** Heading of the details step, e.g. "Driver". */
  noun: string;
  sections: ProfileSection[];
};

const phone = (v: string) => (/^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, "")) ? undefined : "Enter a 10 digit mobile number.");
const gstin = (v: string) => (/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(v) ? undefined : "Enter a valid 15 character GSTIN.");
const plate = (v: string) => (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/.test(v.replace(/[\s-]/g, "")) ? undefined : "Use a plate like MH12AB1234.");

const STATE_HINT = "As printed on the document.";

export const profileConfigs: Record<ProfileRoleId, RoleProfileConfig> = {
  commission_agent: {
    noun: "Commission agent",
    sections: [
      {
        title: "Agent",
        fields: [
          { key: "name", label: "Full name", kind: "text", required: true },
          { key: "phone", label: "Mobile number", kind: "tel", required: true, check: phone, column: true },
          { key: "city", label: "City", kind: "text", required: true, column: true },
        ],
      },
      {
        title: "Business",
        fields: [
          { key: "shop", label: "Shop or firm name", kind: "text", required: true, column: true },
          { key: "licence", label: "Mandi licence number", kind: "text", required: true, upper: true, hint: STATE_HINT },
          { key: "gstin", label: "GSTIN", kind: "text", upper: true, check: gstin, placeholder: "27ABCDE1234F1Z5" },
        ],
      },
      {
        title: "Commission",
        hint: "Default charged on the sales this agent makes.",
        fields: [
          { key: "commissionType", label: "Commission type", kind: "select", required: true, options: ["Percent", "Flat per unit"] },
          { key: "commissionRate", label: "Rate", kind: "number", required: true, min: 0, max: 100000, column: true },
        ],
      },
    ],
  },
  weighbridge_operator: {
    noun: "Weight bridge operator",
    sections: [
      {
        title: "Operator",
        fields: [
          { key: "name", label: "Full name", kind: "text", required: true },
          { key: "phone", label: "Mobile number", kind: "tel", required: true, check: phone, column: true },
          { key: "employeeId", label: "Employee ID", kind: "text", required: true, upper: true },
        ],
      },
      {
        title: "Posting",
        fields: [
          { key: "bridge", label: "Weight bridge", kind: "select", required: true, options: ["Bridge 1", "Bridge 2", "Bridge 3"], column: true },
          { key: "shift", label: "Shift", kind: "select", required: true, options: ["Morning", "Afternoon", "Night"], column: true },
          { key: "certified", label: "Calibration certificate valid till", kind: "date", hint: "Leave empty if not applicable." },
        ],
      },
    ],
  },
  marketplace: {
    noun: "Market place",
    sections: [
      {
        title: "Contact",
        fields: [
          { key: "name", label: "Contact person", kind: "text", required: true },
          { key: "phone", label: "Mobile number", kind: "tel", required: true, check: phone, column: true },
        ],
      },
      {
        title: "Market",
        fields: [
          { key: "market", label: "Market or stall name", kind: "text", required: true, column: true },
          { key: "stall", label: "Stall or shop number", kind: "text", required: true, upper: true, column: true },
          { key: "category", label: "Main category", kind: "select", required: true, options: ["Fruits", "Vegetables", "Spices", "Grains", "Oilseeds", "Pulses", "Mixed"] },
          { key: "address", label: "Address", kind: "textarea" },
        ],
      },
    ],
  },
  driver: {
    noun: "Driver",
    sections: [
      {
        title: "Driver",
        hint: "Spell the name exactly as the gate operator types it at entry.",
        fields: [
          { key: "name", label: "Full name", kind: "text", required: true },
          { key: "phone", label: "Mobile number", kind: "tel", required: true, check: phone, column: true },
        ],
      },
      {
        title: "Licence and vehicle",
        fields: [
          { key: "licence", label: "Driving licence number", kind: "text", required: true, upper: true, column: true },
          { key: "licenceExpiry", label: "Licence valid till", kind: "date", required: true },
          { key: "plate", label: "Usual vehicle number plate", kind: "text", upper: true, check: plate, placeholder: "MH12AB1234", column: true },
          { key: "transporter", label: "Transporter or owner", kind: "text" },
        ],
      },
    ],
  },
  trader: {
    noun: "Trader",
    sections: [
      {
        title: "Trader",
        fields: [
          { key: "name", label: "Full name", kind: "text", required: true },
          { key: "phone", label: "Mobile number", kind: "tel", required: true, check: phone, column: true },
        ],
      },
      {
        title: "Firm",
        fields: [
          { key: "firm", label: "Firm name", kind: "text", required: true, column: true },
          { key: "licence", label: "Trade licence number", kind: "text", required: true, upper: true },
          { key: "gstin", label: "GSTIN", kind: "text", upper: true, check: gstin, placeholder: "27ABCDE1234F1Z5" },
          { key: "city", label: "City", kind: "text", required: true, column: true },
          { key: "address", label: "Address", kind: "textarea" },
        ],
      },
    ],
  },
};

export function isProfileRole(role: string): role is ProfileRoleId {
  return role in profileConfigs;
}

export const profileFields = (role: ProfileRoleId) => profileConfigs[role].sections.flatMap((s) => s.fields);

/** One registered person's profile. The login is linked by `userId`. */
export type RoleProfile = {
  id: string;
  role: ProfileRoleId;
  /** Always taken from the `name` field. */
  name: string;
  values: Record<string, string>;
  createdAt: number;
  createdBy: string;
  userId?: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);

let rows: RoleProfile[] | null = null;

function seed(): RoleProfile[] {
  const today = startOfDay(Date.now());
  const mk = (role: ProfileRoleId, values: Record<string, string>, daysAgo: number): RoleProfile => ({
    id: `prof-${uid()}`,
    role,
    name: values.name,
    values,
    createdAt: today - daysAgo * DAY,
    createdBy: "Asha Menon",
  });
  return [
    mk("driver", { name: "Ramesh Yadav", phone: "9822011100", licence: "MH1220190012345", licenceExpiry: "2031-04-18", plate: "MH12AB1234", transporter: "Patil Transport" }, 30),
    mk("trader", { name: "Kiran Shah", phone: "9890012345", firm: "Shah Fruit Traders", licence: "TL-4471", city: "Pune" }, 18),
    mk("commission_agent", { name: "Meera Joshi", phone: "9765432100", city: "Pune", shop: "Joshi Commission Agency", licence: "MC-2208", commissionType: "Percent", commissionRate: "6" }, 12),
  ];
}

export const allProfiles = () => (rows ??= seed());

export type RegisteredVehicle = {
  driverName: string;
  driverPhone: string;
  transporter: string;
  supplier: string;
  /** Everything the supplier deals in, comma separated. */
  commodity: string;
};

const plateKey = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * What admin registered for a plate: the driver whose usual vehicle it is, and
 * the supplier who runs it. Returns null when the plate is in neither list.
 */
export function registeredVehicle(plate: string): RegisteredVehicle | null {
  const key = plateKey(plate);
  if (!key) return null;
  const driver = allProfiles().find((p) => p.role === "driver" && plateKey(p.values.plate ?? "") === key);
  const supplier = allSuppliers().find((s) => s.plates.some((x) => plateKey(x) === key));
  // A supplier's dispatch for this plate is the freshest word on today's trip.
  const dispatch = pendingDispatchFor(plate);
  if (!driver && !supplier && !dispatch) return null;
  return {
    driverName: dispatch?.driverName || driver?.name || "",
    driverPhone: dispatch?.driverPhone || driver?.values.phone || "",
    transporter: dispatch?.transporter || driver?.values.transporter || "",
    supplier: dispatch?.supplierName || supplier?.name || "",
    commodity: dispatch?.commodity || supplier?.commodities.join(", ") || "",
  };
}

function cleanValues(role: ProfileRoleId, values: Record<string, string>) {
  const clean: Record<string, string> = {};
  for (const f of profileFields(role)) {
    const raw = (values[f.key] ?? "").trim();
    clean[f.key] = f.upper ? raw.toUpperCase().replace(/\s+/g, "") : raw;
  }
  return clean;
}

export const getProfile = (id: string) => allProfiles().find((p) => p.id === id);

/** Replace a profile's details. Returns null when it no longer exists. */
export function updateProfile(id: string, values: Record<string, string>): RoleProfile | null {
  const p = getProfile(id);
  if (!p) return null;
  p.values = cleanValues(p.role, values);
  p.name = p.values.name;
  commit();
  return p;
}

export function deleteProfile(id: string): boolean {
  const list = allProfiles();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  commit();
  return true;
}

export function addProfile(role: ProfileRoleId, values: Record<string, string>, admin: string, userId?: string): RoleProfile {
  const clean = cleanValues(role, values);
  const record: RoleProfile = { id: `prof-${uid()}`, role, name: clean.name, values: clean, createdAt: Date.now(), createdBy: admin, userId };
  allProfiles().unshift(record);
  commit();
  return record;
}
