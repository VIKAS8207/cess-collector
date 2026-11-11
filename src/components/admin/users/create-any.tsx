"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/select-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { CreateUserForm } from "@/components/admin/users/create-user";
import { ProfileCreate } from "@/components/admin/roles/role-page";
import { SupplierCreate } from "@/components/admin/supplier/supplier-page";
import { isProfileRole } from "@/lib/domain/role-profiles";
import { roleLabel, roles, type RoleId } from "@/lib/roles";

/**
 * One place to create anyone: pick the role, fill that role's own form, then the
 * login. Roles with a business profile (supplier, driver, trader and so on) get
 * their details form first; gate operators and admins go straight to the login.
 */
export function CreateRoleDrawer({
  open,
  admin,
  onClose,
  onCreated,
}: {
  open: boolean;
  admin: string;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  return (
    <SideDrawer open={open} onClose={onClose} wide title="Create user" description="Choose the role, fill in the details, then set the login.">
      {open && <CreateAnyRole admin={admin} onClose={onClose} onCreated={onCreated} />}
    </SideDrawer>
  );
}

function CreateAnyRole({ admin, onClose, onCreated }: { admin: string; onClose: () => void; onCreated: (message: string) => void }) {
  const [role, setRole] = useState<RoleId | "">("");
  const label = role ? roleLabel(role) : "";
  const done = (_id: string, name: string, message?: string) => onCreated(message ?? `${name} created as ${label}.`);

  return (
    <>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Role</h3>
        <SelectField
          id="ca-role"
          label="Role"
          required
          value={role}
          onChange={(v) => setRole(v as RoleId | "")}
          options={[{ value: "", label: "Select a role" }, ...roles.map((r) => ({ value: r.id, label: r.label }))]}
          hint="The form below changes to match the role."
        />
      </section>

      {role === "supplier" && <SupplierCreate key={role} admin={admin} onDone={done} onCancel={onClose} />}
      {role && isProfileRole(role) && (
        <ProfileCreate key={role} roleId={role} label={label} ctx={{ admin, close: onClose, created: done }} />
      )}
      {(role === "gate_operator" || role === "admin") && (
        <CreateUserForm key={role} admin={admin} lockedRole={role} onCancel={onClose} onDone={(u) => onCreated(`${u.name} created as ${label}.`)} />
      )}
    </>
  );
}
