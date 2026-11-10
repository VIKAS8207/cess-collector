"use client";

import { useState } from "react";
import { ArrowLeftIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { type Column } from "@/components/ui/data-table";
import { RosterShell } from "@/components/admin/roles/roster-shell";
import { SupplierForm } from "@/components/admin/supplier/supplier-form";
import { CreateUserForm } from "@/components/admin/users/create-user";
import { getSuppliers, submitCreateSupplier, type SupplierProfile } from "@/lib/api/admin";
import { formatDate } from "@/lib/format";
import type { SupplierRecord } from "@/lib/domain/admin-types";

const columns: Column<SupplierRecord>[] = [
  { key: "name", header: "Name", primary: true, cell: (s) => s.name },
  { key: "state", header: "State", hideBelow: "lg", cell: (s) => s.state },
  { key: "city", header: "City", hideBelow: "lg", cell: (s) => s.city },
  {
    key: "commodities",
    header: "Commodity",
    cell: (s) => (
      <span className="flex flex-wrap gap-1">
        {s.commodities.map((c) => (
          <Pill key={c}>{c}</Pill>
        ))}
      </span>
    ),
  },
  {
    key: "vehicles",
    header: "Vehicles",
    hideBelow: "xl",
    cell: (s) => (
      <span className="text-caption text-muted-foreground">
        <span className="tabular-nums text-foreground">{s.vehicleCount}</span>
        {" · "}
        {s.plates.join(", ")}
      </span>
    ),
  },
  {
    key: "created",
    header: "Created",
    hideBelow: "2xl",
    cell: (s) => <span className="text-caption tabular-nums text-muted-foreground">{formatDate(s.createdAt)}</span>,
  },
];

/**
 * The Supplier page: a roster of supplier records (not logins) with a
 * two-step Create form — step 1 the supplier profile, step 2 the login.
 */
export function SupplierPage() {
  return (
    <RosterShell<SupplierRecord>
      roleId="supplier"
      label="Supplier"
      description="Suppliers with their location, commodities and vehicles."
      searchPlaceholder="Name, city, commodity or plate"
      emptyIcon={TruckIcon}
      emptyText={(q) => (q ? "No suppliers match." : "No suppliers yet.")}
      countLabel={(n) => `${n} ${n === 1 ? "supplier" : "suppliers"}`}
      load={(q) => getSuppliers({ q })}
      columns={columns}
      rowKey={(s) => s.id}
      rowName={(s) => s.name}
      minWidth={760}
      createHeading="Create supplier"
      createHint="First the supplier details, then the login credentials."
      renderCreate={(ctx) => <SupplierCreate admin={ctx.admin} onDone={ctx.created} onCancel={ctx.close} />}
    />
  );
}

/** Two steps: supplier profile, then credentials. Saving happens on step 2. */
function SupplierCreate({
  admin,
  onDone,
  onCancel,
}: {
  admin: string;
  onDone: (id: string, name: string, message?: string) => void;
  onCancel: () => void;
}) {
  const [profile, setProfile] = useState<SupplierProfile | null>(null);

  // Step 1 stays mounted while step 2 is open, so Back keeps every entry.
  return (
    <div className="flex flex-col gap-4">
      <div hidden={profile !== null} className="flex flex-col gap-4">
        <p role="status" className="text-caption text-muted-foreground">
          Step 1 of 2 · Supplier details
        </p>
        <SupplierForm onNext={setProfile} onCancel={onCancel} />
      </div>

      {profile && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-caption text-muted-foreground">
              Step 2 of 2 · Login credentials
            </p>
            <Button variant="outline" size="sm" onClick={() => setProfile(null)}>
              <ArrowLeftIcon aria-hidden="true" />
              Back to details
            </Button>
          </div>
          <p className="rounded-field bg-muted px-3 py-3 text-sm text-muted-foreground">
            {profile.name} · {profile.city}, {profile.state} · {profile.commodities.join(", ")} ·{" "}
            {profile.plates.length} {profile.plates.length === 1 ? "vehicle" : "vehicles"}
          </p>
          <CreateUserForm
            admin={admin}
            lockedRole="supplier"
            onCancel={() => setProfile(null)}
            onDone={async (u) => {
              const record = await submitCreateSupplier({ ...profile, userId: u.id }, admin);
              onDone(record.id, record.name, `${record.name} added with ${record.vehicleCount} ${record.vehicleCount === 1 ? "vehicle" : "vehicles"}.`);
            }}
          />
        </>
      )}
    </div>
  );
}
