"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-store";
import { supplierForLogin } from "@/lib/api/dispatch";
import { allSuppliers } from "@/lib/domain/supplier-store";
import type { SupplierRecord } from "@/lib/domain/admin-types";

/**
 * The supplier the signed-in user acts as: their own record when there is one,
 * otherwise a blank one made from the login. An admin viewing as supplier gets
 * the first supplier, as a demo. Shared by the supplier dashboard and Dispatches.
 */
export function useSupplier() {
  const { user } = useAuth();
  const supplier = useMemo<SupplierRecord | null>(() => {
    if (!user) return null;
    const own = supplierForLogin(user.email, user.name);
    if (own) return own;
    if (user.isAdmin && allSuppliers()[0]) return allSuppliers()[0];
    return { id: `login-${user.email}`, name: user.name, state: "", city: "", commodities: [], vehicleCount: 0, plates: [], createdAt: 0, createdBy: "" };
  }, [user]);
  return { user, supplier, demo: !!user?.isAdmin };
}
