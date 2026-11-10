import type { Metadata } from "next";
import { SupplierPage } from "@/components/admin/supplier/supplier-page";

// Gated client-side (frontend-only auth); see the dashboard page.
export const instant = false;

export const metadata: Metadata = { title: "Supplier" };

export default function Page() {
  return <SupplierPage />;
}
