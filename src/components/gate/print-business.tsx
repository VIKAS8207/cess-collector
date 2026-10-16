import { businessInfo } from "@/lib/domain/settings";

/** Business name and address line for the top of every printed report. */
export function PrintBusiness() {
  const b = businessInfo();
  return (
    <p className="text-sm">
      {b.name} · {b.address}, {b.city} · {b.phone}
    </p>
  );
}
