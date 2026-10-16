import { Suspense } from "react";
import type { Metadata } from "next";
import { ActivityPage } from "@/components/admin/activity/activity-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "All Activity" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ActivityPage />
    </Suspense>
  );
}
