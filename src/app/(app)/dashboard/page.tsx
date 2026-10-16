import type { Metadata } from "next";
import { RoleDashboard } from "@/components/app/role-pages";

// Gated client-side (frontend-only auth): the page renders after sign-in is
// known, so opt out of instant-navigation validation until a real session exists.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <RoleDashboard />;
}
