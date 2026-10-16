import { Suspense } from "react";
import type { Metadata } from "next";
import { UsersPage } from "@/components/admin/users/users-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Users & Roles" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <UsersPage />
    </Suspense>
  );
}
