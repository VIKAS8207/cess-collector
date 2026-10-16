import { Suspense } from "react";
import type { Metadata } from "next";
import { MastersPage } from "@/components/admin/masters/masters-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Masters" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MastersPage />
    </Suspense>
  );
}
