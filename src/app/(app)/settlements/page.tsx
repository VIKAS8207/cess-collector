import { Suspense } from "react";
import type { Metadata } from "next";
import { SettlementsPage } from "@/components/settlements/settlements-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Settlements" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SettlementsPage />
    </Suspense>
  );
}
