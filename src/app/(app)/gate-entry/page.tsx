import type { Metadata } from "next";
import { EntryPage } from "@/components/gate-entry/entry-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Gate Entry" };

export default function Page() {
  return <EntryPage />;
}
