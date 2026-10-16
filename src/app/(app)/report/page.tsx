import type { Metadata } from "next";
import { RoleReport } from "@/components/app/role-pages";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Report" };

export default function Page() {
  return <RoleReport />;
}
