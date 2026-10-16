import type { Metadata } from "next";
import { ReceivePage } from "@/components/receive/receive-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Receive Goods" };

export default function Page() {
  return <ReceivePage />;
}
