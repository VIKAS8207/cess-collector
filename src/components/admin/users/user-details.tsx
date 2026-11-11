"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileForm } from "@/components/admin/roles/profile-form";
import { SupplierForm } from "@/components/admin/supplier/supplier-form";
import { useToast } from "@/components/gate/toast";
import { submitCreateSupplier, submitUpdateRoleProfile, submitUpdateSupplier } from "@/lib/api/admin";
import { allProfiles, isProfileRole, profileConfigs, profileFields } from "@/lib/domain/role-profiles";
import { allSuppliers } from "@/lib/domain/supplier-store";
import type { AppUser } from "@/lib/domain/admin-types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-caption text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="text-[15px] break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

/**
 * The role's own details for a user (supplier, driver, trader and so on), shown
 * in the user drawer with an Edit button. Gate operators and admins have none.
 */
export function UserDetails({ user, admin }: { user: AppUser; admin: string }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const supplier = user.role === "supplier" ? allSuppliers().find((s) => s.userId === user.id) : undefined;
  const role = isProfileRole(user.role) ? user.role : null;
  const profile = role ? allProfiles().find((p) => p.userId === user.id) : undefined;
  if (user.role !== "supplier" && !role) return null;

  const done = (message: string) => {
    setBusy(false);
    setEditing(false);
    toast.push(message);
  };

  const existing = user.role === "supplier" ? !!supplier : !!profile;
  const noun = user.role === "supplier" ? "Supplier" : role ? profileConfigs[role].noun : "";

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ud-details">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="ud-details" className="text-heading-md text-foreground">{noun} details</h3>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon aria-hidden="true" />
            {existing ? "Edit details" : "Add details"}
          </Button>
        )}
      </div>

      {editing && user.role === "supplier" && (
        <SupplierForm
          initial={supplier ? { name: supplier.name, state: supplier.state, city: supplier.city, commodities: supplier.commodities, plates: supplier.plates, userId: supplier.userId } : undefined}
          submitLabel="Save details"
          busy={busy}
          onCancel={() => setEditing(false)}
          onNext={async (p) => {
            setBusy(true);
            if (supplier) await submitUpdateSupplier(supplier.id, p);
            else await submitCreateSupplier({ ...p, userId: user.id }, admin);
            done(`${p.name} updated.`);
          }}
        />
      )}

      {editing && role && (
        <ProfileForm
          role={role}
          initial={{ ...(profile?.values ?? {}), name: profile?.name ?? user.name }}
          submitLabel="Save details"
          busy={busy}
          onCancel={() => setEditing(false)}
          onNext={async (values) => {
            setBusy(true);
            await submitUpdateRoleProfile(role, profile?.id ?? user.id, values, admin);
            done(`${values.name} updated.`);
          }}
        />
      )}

      {!editing && existing && user.role === "supplier" && supplier && (
        <dl className="flex flex-col gap-3">
          <Row label="State" value={supplier.state} />
          <Row label="City" value={supplier.city} />
          <Row label="Commodities" value={supplier.commodities.join(", ")} />
          <Row label="Vehicles" value={supplier.plates.join(", ")} />
        </dl>
      )}

      {!editing && role && profile && (
        <dl className="flex flex-col gap-3">
          {profileFields(role)
            .filter((f) => f.key !== "name")
            .map((f) => (
              <Row key={f.key} label={f.label} value={profile.values[f.key] ?? ""} />
            ))}
        </dl>
      )}

      {!editing && !existing && <p className="text-sm text-muted-foreground">No {noun.toLowerCase()} details saved yet.</p>}
    </section>
  );
}
