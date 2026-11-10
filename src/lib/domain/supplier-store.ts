import { commit } from "./store";
import { startOfDay } from "./seed";
import { DAY } from "./types";
import type { SupplierRecord } from "./admin-types";

const uid = () => Math.random().toString(36).slice(2, 9);

let rows: SupplierRecord[] | null = null;

/** Suppliers live for the page session, like the other mock stores. */
function seed(): SupplierRecord[] {
  const today = startOfDay(Date.now());
  const mk = (
    name: string,
    state: string,
    city: string,
    commodities: string[],
    plates: string[],
    daysAgo: number
  ): SupplierRecord => ({
    id: `sup-${uid()}`,
    name,
    state,
    city,
    commodities,
    vehicleCount: plates.length,
    plates,
    createdAt: today - daysAgo * DAY,
    createdBy: "Asha Menon",
  });
  return [
    mk("Sunil Patil", "Maharashtra", "Pune", ["Fruits", "Spices"], ["MH12AB1234", "MH14CD5678"], 45),
    mk("Anita Deshmukh", "Karnataka", "Bengaluru", ["Grains", "Oilseeds"], ["KA01MN4321"], 22),
    mk("Farhan Qureshi", "Gujarat", "Ahmedabad", ["Fruits", "Vegetables", "Grains"], ["GJ05XY9876", "GJ01PQ2468", "GJ03RT1357"], 9),
  ];
}

export const allSuppliers = () => (rows ??= seed());

export const getSupplier = (id: string) => allSuppliers().find((s) => s.id === id);

export function updateSupplier(
  id: string,
  input: { name: string; state: string; city: string; commodities: string[]; plates: string[] }
): SupplierRecord | null {
  const s = getSupplier(id);
  if (!s) return null;
  s.name = input.name.trim();
  s.state = input.state;
  s.city = input.city.trim();
  s.commodities = input.commodities;
  s.plates = input.plates;
  s.vehicleCount = input.plates.length;
  commit();
  return s;
}

export function deleteSupplier(id: string): SupplierRecord | null {
  const list = allSuppliers();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const [gone] = list.splice(i, 1);
  commit();
  return gone;
}

export function addSupplier(
  input: { name: string; state: string; city: string; commodities: string[]; plates: string[]; userId?: string },
  admin: string
): SupplierRecord {
  const record: SupplierRecord = {
    id: `sup-${uid()}`,
    name: input.name.trim(),
    state: input.state,
    city: input.city.trim(),
    commodities: input.commodities,
    vehicleCount: input.plates.length,
    plates: input.plates,
    createdAt: Date.now(),
    createdBy: admin,
    userId: input.userId,
  };
  allSuppliers().unshift(record);
  commit();
  return record;
}
