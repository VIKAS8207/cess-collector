"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { submitCreateUser } from "@/lib/api/admin";
import { validateEmail } from "@/lib/validation";
import { roles, type RoleId } from "@/lib/roles";
import type { AppUser } from "@/lib/domain/admin-types";

export function CreateUserDrawer({
  open,
  admin,
  onClose,
  onCreated,
}: {
  open: boolean;
  admin: string;
  onClose: () => void;
  onCreated: (u: AppUser) => void;
}) {
  return (
    <SideDrawer open={open} onClose={onClose} title="Create user" description="They log in with their email and set their own password.">
      {open && <Body admin={admin} onCreated={onCreated} />}
    </SideDrawer>
  );
}

function Body({ admin, onCreated }: { admin: string; onCreated: (u: AppUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleId>("gate_operator");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const errors = {
    name: name.trim() ? undefined : "Enter the name.",
    email: duplicate ? "A user with this email already exists." : validateEmail(email),
  };
  const valid = !errors.name && !errors.email;

  const submit = async () => {
    setAttempted(true);
    if (!valid || saving) return;
    setSaving(true);
    const res = await submitCreateUser({ name, email, role }, admin);
    setSaving(false);
    if (res.ok) onCreated(res.user);
    else {
      setDuplicate(true);
      document.getElementById("cu-email")?.focus();
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Identity</h3>
        <TextField id="cu-name" label="Name" required value={name} onChange={setName} error={attempted ? errors.name : undefined} autoComplete="off" disabled={saving} />
        <TextField
          id="cu-email"
          label="Email"
          required
          type="email"
          inputMode="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            setDuplicate(false);
          }}
          error={attempted || duplicate ? errors.email : undefined}
          autoComplete="off"
          disabled={saving}
        />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Access</h3>
        <SelectField id="cu-role" label="Role" value={role} onChange={(v) => setRole(v as RoleId)} options={roles.map((r) => ({ value: r.id, label: r.label }))} disabled={saving} />
      </section>
      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Invite</h3>
        <p className="rounded-field bg-muted px-3 py-3 text-sm text-muted-foreground">
          The first password is set by the user through the OTP flow. No password is shown here.
        </p>
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Create user
        </Button>
      </section>
    </form>
  );
}
