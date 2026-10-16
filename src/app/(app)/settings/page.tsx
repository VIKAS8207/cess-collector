import type { Metadata } from "next";
import { RoleSettings } from "@/components/app/role-pages";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <RoleSettings />;
}
