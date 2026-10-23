import {
  DAY,
  GATE,
  HOUR,
  MINUTE,
  type ExceptionEvent,
  type Movement,
  type Purpose,
  type Weighment,
  type VehicleType,
} from "./types";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A flat placeholder picture standing in for a photo taken at the bridge. */
function photoFor(stage: string, product: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#0d253d"/><text x="240" y="145" font-family="sans-serif" font-size="22" fill="#fff" text-anchor="middle">${stage} weighing</text><text x="240" y="178" font-family="sans-serif" font-size="16" fill="#9fb3c8" text-anchor="middle">${product}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const operators = ["Avery Morgan", "Ravi Kumar", "Meera Shah"];
const firstNames = ["Ramesh", "Suresh", "Mahesh", "Imran", "Gurpreet", "Vijay", "Anil", "Sanjay", "Deepak", "Harish", "Mohan", "Irfan", "Karthik", "Naveen", "Pradeep"];
const lastNames = ["Yadav", "Patil", "Singh", "Khan", "Reddy", "Sharma", "Gowda", "Nair", "Chauhan", "Mishra"];
const transporters = ["Shree Logistics", "Gati Carriers", "Blue Dart Freight", "Sai Roadlines", "Patel Transport Co.", "Jai Ambe Cargo", "National Haulage", "Om Sai Movers"];
const states = ["MH", "GJ", "KA", "TN", "RJ", "UP", "DL", "MP"];
const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
const classes = ["Class 4 · Truck (2 axle)", "Class 5 · Truck (3 axle)", "Class 6 · Truck (4-6 axle)", "Class 7 · Truck (7+ axle)"];
const banks = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "IDFC FIRST Bank", "Paytm Payments Bank"];
const products = ["Basmati rice", "Wheat", "Sugar", "Soybean oil", "Onion", "Toor dal"];
const types: VehicleType[] = ["Truck", "Truck", "Truck", "Trailer", "Tanker", "Container", "Container", "Pickup"];
const purposeList: Purpose[] = ["Loading", "Unloading", "Unloading"];

type Fleet = {
  plate: string;
  fastag: string;
  driverName: string;
  driverPhone: string;
  vehicleType: VehicleType;
  transporter: string;
  vehicleClass: string;
  bank: string;
};

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function buildSeed(now: number): { movements: Movement[]; events: ExceptionEvent[] } {
  const r = rng(20260617);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");

  const fleet: Fleet[] = Array.from({ length: 70 }, () => ({
    plate: `${pick(states)}${digits(2)}${pick([...letters])}${pick([...letters])}${digits(4)}`,
    fastag: `3416${digits(16)}`,
    driverName: `${pick(firstNames)} ${pick(lastNames)}`,
    driverPhone: `9${digits(9)}`,
    vehicleType: pick(types),
    transporter: pick(transporters),
    vehicleClass: pick(classes),
    bank: pick(banks),
  }));

  // Two fixed drivers for the Driver role demo: the first has a truck inside, the second only past trips.
  fleet[0].driverName = "Ramesh Gaikwad";
  fleet[1].driverName = "Suresh Jadhav";

  const movements: Movement[] = [];
  let seq = 1000;
  const insidePlates = new Set<string>();

  const make = (f: Fleet, entryAt: number, exitAt: number | null): Movement => {
    const operator = pick(operators);
    seq += 1;
    const audit = [{ at: entryAt, by: operator, action: "Entry recorded" }];
    if (exitAt) audit.push({ at: exitAt, by: operator, action: "Exit approved" });
    // Trucks inside for a while have always been weighed; the newest ones are left for the weight bridge demo.
    const weighed = exitAt ? r() < 0.5 || f.driverName === "Ramesh Gaikwad" || f.driverName === "Suresh Jadhav" : now - entryAt > 40 * MINUTE;
    const grossKg = Math.round(18000 + r() * 24000);
    const tareKg = Math.round(grossKg * (0.28 + r() * 0.17));
    const bridge = r() < 0.8;
    const product = pick(products);
    const src = bridge ? ("bridge" as const) : ("manual" as const);
    const weighments: Weighment[] | undefined = weighed
      ? [
          ...(exitAt ? [{ stage: "tare" as const, kg: tareKg, source: src, at: exitAt - 15 * MINUTE, by: "Sanjay Verma", product, photo: photoFor("Tare", product) }] : []),
          { stage: "gross" as const, kg: grossKg, source: src, at: entryAt + 12 * MINUTE, by: "Sanjay Verma", product, photo: photoFor("Gross", product) },
        ]
      : undefined;
    return {
      weighments,
      id: `mv-${seq}`,
      entryNo: `GE-${seq}`,
      plate: f.plate,
      fastag: f.fastag,
      noFastag: false,
      vehicleClass: f.vehicleClass,
      bank: f.bank,
      driverName: f.driverName,
      driverPhone: f.driverPhone,
      vehicleType: f.vehicleType,
      transporter: f.transporter,
      purpose: pick(purposeList),
      reference: r() < 0.6 ? `PO-${digits(5)}` : "",
      remarks: "",
      entryAt,
      exitAt,
      status: exitAt ? "Exited" : "Inside",
      operator,
      exitOperator: exitAt ? operator : undefined,
      gate: GATE,
      createdAt: entryAt,
      updatedAt: exitAt ?? entryAt,
      audit,
    };
  };

  const today = startOfDay(now);

  // Completed visits for the last 30 days.
  for (let d = 29; d >= 0; d--) {
    const dayStart = today - d * DAY;
    const weekday = new Date(dayStart).getDay();
    const count = Math.round((weekday === 0 ? 14 : 30 + r() * 14) * (d === 0 ? 0.6 : 1));
    for (let i = 0; i < count; i++) {
      const hour = 6 + Math.pow(r(), 0.8) * 15.5;
      const entryAt = dayStart + hour * HOUR;
      const dwell = (0.4 + Math.pow(r(), 1.7) * 7.2) * HOUR;
      const exitAt = entryAt + dwell;
      if (exitAt > now - 20 * MINUTE) continue; // still in the future for today
      movements.push(make(pick(fleet), entryAt, exitAt));
    }
  }

  // Vehicles currently inside, including two over-stays.
  const insideOffsets = [12, 25, 41, 55, 70, 95, 120, 150, 185, 230, 290, 360].map((m) => m * MINUTE);
  insideOffsets.push(9 * HOUR + 10 * MINUTE, 27 * HOUR);
  for (const [n, offset] of insideOffsets.entries()) {
    let f = n === 6 ? fleet[0] : pick(fleet);
    while (insidePlates.has(f.plate) || (n !== 6 && (f === fleet[0] || f === fleet[1]))) f = pick(fleet);
    insidePlates.add(f.plate);
    movements.push(make(f, now - offset, null));
  }

  // Previously flagged exits without an entry.
  for (let i = 0; i < 6; i++) {
    const f = pick(fleet);
    const at = today - (2 + i * 4) * DAY + (8 + r() * 8) * HOUR;
    seq += 1;
    const cleared = i > 1;
    movements.push({
      ...make(f, at, null),
      id: `mv-${seq}`,
      entryNo: `FL-${seq}`,
      entryAt: null,
      status: "Flagged",
      createdAt: at,
      updatedAt: at,
      operator: pick(operators),
      audit: [
        { at, by: pick(operators), action: "Flagged for supervisor", note: "Exit attempted without an open entry" },
        ...(cleared ? [{ at: at + 2 * HOUR, by: "Supervisor", action: "Flag cleared" }] : []),
      ],
      flag: {
        kind: "no-open-entry",
        reason: "Exit attempted without an open entry.",
        at,
        clearedAt: cleared ? at + 2 * HOUR : undefined,
        clearedBy: cleared ? "Supervisor" : undefined,
      },
    });
  }

  // Blocked duplicates and conflicts from earlier days.
  const events: ExceptionEvent[] = [];
  for (let i = 0; i < 9; i++) {
    const f = pick(fleet);
    const conflict = i % 4 === 3;
    events.push({
      id: `ev-${i}`,
      kind: conflict ? "conflict" : "duplicate-attempt",
      at: today - (i + 1) * DAY * 2.6 + (9 + r() * 8) * HOUR,
      plate: f.plate,
      fastag: f.fastag,
      reason: conflict
        ? "FASTag is already linked to another vehicle that is inside."
        : "Plate already has an open entry.",
      operator: pick(operators),
      gate: GATE,
    });
  }

  movements.sort((a, b) => (b.entryAt ?? b.createdAt) - (a.entryAt ?? a.createdAt));
  return { movements, events };
}
