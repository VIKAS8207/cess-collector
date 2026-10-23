import { delay } from "./delay";
import { allocationsFor } from "@/lib/domain/agent-store";
import { allMovements } from "@/lib/domain/store";
import type { Movement } from "@/lib/domain/types";

export type DriverTrip = {
  movement: Movement;
  /** Commission agents who handled this truck's goods. The only other person a driver is told about. */
  agents: string[];
};

/** A driver sees only trips made under their own name. Trips are matched on the driver name. */
export async function getDriverTrips(name: string, opts?: { forceError?: boolean }): Promise<DriverTrip[]> {
  await delay();
  if (opts?.forceError) throw new Error("Could not load your trips.");
  const me = name.trim().toLowerCase();
  if (!me) return [];
  return allMovements()
    .filter((m) => m.entryAt && m.driverName.trim().toLowerCase() === me && (m.status === "Inside" || m.status === "Exited"))
    .sort((a, b) => b.entryAt! - a.entryAt!)
    .map((movement) => ({ movement, agents: [...new Set(allocationsFor(movement.id).map((a) => a.agent))] }));
}

// ---------- demo data ----------
// TEMPORARY. Dummy trips for showing the Driver page to anyone, whatever email they sign in with.
// Remove this block and set DRIVER_DEMO to false in driver-home.tsx to use the real lookup above.

const MIN = 60_000;
const HR = 60 * MIN;
const DAY = 24 * HR;

const demoPlates = ["MH12AB4821", "MH14CD7710", "MH12AB4821", "GJ05XY2203", "MH12AB4821", "KA19EF5530", "MH14CD7710", "MH12AB4821", "GJ05XY2203", "MH12AB4821", "MH14CD7710", "KA19EF5530"];
const demoAgents: string[][] = [
  ["Ravi Kumar"],
  ["Imran Khan"],
  ["Ravi Kumar", "Imran Khan"],
  ["Imran Khan"],
  ["Ravi Kumar"],
  ["Ravi Kumar", "Imran Khan"],
  ["Imran Khan"],
  ["Ravi Kumar"],
  ["Imran Khan"],
  ["Ravi Kumar", "Imran Khan"],
  ["Ravi Kumar"],
  ["Imran Khan"],
];

function demoMovement(n: number, plate: string, entryAt: number, exitAt: number | null): Movement {
  return {
    id: `demo-${n}`,
    entryNo: `GE-${2041 - n}`,
    plate,
    fastag: "",
    noFastag: false,
    vehicleClass: "",
    bank: "",
    driverName: "Demo Driver",
    driverPhone: "",
    vehicleType: "Truck",
    transporter: "",
    purpose: "Unloading",
    reference: "",
    remarks: "",
    entryAt,
    exitAt,
    status: exitAt ? "Exited" : "Inside",
    operator: "",
    gate: "Gate 1",
    createdAt: entryAt,
    updatedAt: exitAt ?? entryAt,
    audit: [],
  };
}

/** `inside` true gives an active trip plus past trips; false gives past trips only. */
export function demoDriverTrips(now: number, inside: boolean): DriverTrip[] {
  const trips: DriverTrip[] = [];
  if (inside) {
    trips.push({ movement: demoMovement(0, "MH12AB4821", now - (2 * HR + 15 * MIN), null), agents: ["Ravi Kumar", "Imran Khan"] });
  }
  demoPlates.forEach((plate, i) => {
    const entry = now - (i + 1) * (DAY * 1.2) - (i % 3) * HR;
    const exit = entry + (1 + (i % 4)) * HR + 20 * MIN;
    trips.push({ movement: demoMovement(i + 1, plate, entry, exit), agents: demoAgents[i] });
  });
  return trips;
}
