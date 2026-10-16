import { Suspense } from "react";
import type { Metadata } from "next";
import { VehiclesPage } from "@/components/vehicles/vehicles-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "All Vehicles" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <VehiclesPage />
    </Suspense>
  );
}
