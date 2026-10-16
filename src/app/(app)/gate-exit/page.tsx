import { Suspense } from "react";
import type { Metadata } from "next";
import { ExitPage } from "@/components/gate-exit/exit-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Gate Exit" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExitPage />
    </Suspense>
  );
}
