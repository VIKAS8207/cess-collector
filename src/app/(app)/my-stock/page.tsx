import type { Metadata } from "next";
import { StockPage } from "@/components/trader/stock/stock-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "My Stock" };

export default function Page() {
  return <StockPage />;
}
