import { Suspense } from "react";
import type { Metadata } from "next";
import { AllocatePage } from "@/components/allocate/allocate-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Allocate to Traders" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AllocatePage />
    </Suspense>
  );
}
