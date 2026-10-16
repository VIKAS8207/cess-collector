import { Suspense } from "react";
import type { Metadata } from "next";
import { CollectionsPage } from "@/components/trader/collections/collections-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Collections" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CollectionsPage />
    </Suspense>
  );
}
