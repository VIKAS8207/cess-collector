import { Suspense } from "react";
import type { Metadata } from "next";
import { WeighPage } from "@/components/weigh/weigh-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Weight Bridge" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <WeighPage />
    </Suspense>
  );
}
