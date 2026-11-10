import type { Metadata } from "next";
import { DispatchPage } from "@/components/supplier/dispatch-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Dispatches" };

export default function Page() {
  return <DispatchPage />;
}
