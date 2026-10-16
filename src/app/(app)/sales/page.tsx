import { Suspense } from "react";
import type { Metadata } from "next";
import { RoleSales } from "@/components/app/role-pages";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RoleSales />
    </Suspense>
  );
}
