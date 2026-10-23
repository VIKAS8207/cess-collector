import { Suspense } from "react";
import type { Metadata } from "next";
import { TracePage } from "@/components/market/trace-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Trace Truck" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TracePage />
    </Suspense>
  );
}
