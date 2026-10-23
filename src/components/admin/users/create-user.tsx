"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { SideDrawer } from "@/components/gate/side-drawer";
import { submitCreateUser } from "@/lib/api/admin";
import { validateEmail } from "@/lib/validation";
import { roleLabel, roles, type RoleId } from "@/lib/roles";
import type { AppUser } from "@/lib/domain/admin-types";

/** Letters and digits without look-alikes (no 0/O, 1/l/I), so it can be read out or typed from a note. */
function generatePassword(length = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

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
    <SideDrawer open={open} onClose={onClose} title="Create credentials" description="Set the login for any role. Share the email and password with the person.">
      {open && <Body admin={admin} onDone={onCreated} />}
    </SideDrawer>
  );
}

function Body({ admin, onDone }: { admin: string; onDone: (u: AppUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleId>("gate_operator");
  const [password, setPassword] = useState(() => generatePassword());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [created, setCreated] = useState<{ user: AppUser; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const errors = {
    name: name.trim() ? undefined : "Enter the name.",
    email: duplicate ? "A user with this email already exists." : validateEmail(email),
    password: password.length >= 6 ? undefined : "Use at least 6 characters.",
  };
  const valid = !errors.name && !errors.email && !errors.password;

  const submit = async () => {
    setAttempted(true);
    if (!valid || saving) return;
    setSaving(true);
    const res = await submitCreateUser({ name, email, role, password }, admin);
    setSaving(false);
    if (res.ok) setCreated({ user: res.user, password });
    else {
      setDuplicate(true);
      document.getElementById("cu-email")?.focus();
    }
  };

  const credentialsText = created
    ? `CESS Collector login\nRole: ${roleLabel(created.user.role)}\nName: ${created.user.name}\nEmail: ${created.user.email}\nPassword: ${created.password}`
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentialsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the credentials stay on screen to copy by hand */
    }
  };

  if (created) {
    return (
      <div className="flex flex-col gap-6">
        <div role="status" className="flex flex-col gap-1 rounded-card bg-muted p-4">
          <p className="text-[15px] text-foreground">Credentials created for {created.user.name}.</p>
          <p className="text-sm text-muted-foreground">They can sign in now. Copy these and share them safely, because the password is not shown again.</p>
        </div>
        <dl className="flex flex-col gap-4 rounded-card border border-border p-5">
          <div>
            <dt className="text-caption text-muted-foreground">Role</dt>
            <dd className="text-[15px] text-foreground">{roleLabel(created.user.role)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Name</dt>
            <dd className="text-[15px] text-foreground">{created.user.name}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Email (login)</dt>
            <dd className="text-[15px] break-all text-foreground">{created.user.email}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Password</dt>
            <dd className="text-[17px] tracking-wider text-foreground tabular-nums">{created.password}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={copy}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy credentials"}
          </Button>
          <Button onClick={() => onDone(created.user)}>Done</Button>
        </div>
      </div>
    );
  }

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
        <h3 className="text-heading-md text-foreground">Role</h3>
        <SelectField id="cu-role" label="Role" required value={role} onChange={(v) => setRole(v as RoleId)} options={roles.map((r) => ({ value: r.id, label: r.label }))} disabled={saving} />
        {role === "driver" && (
          <p className="rounded-field bg-muted px-3 py-3 text-sm text-muted-foreground">
            A driver sees the trips entered under their own name, so spell the name exactly as the gate operator types it at entry.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-heading-md text-foreground">Identity</h3>
        <TextField id="cu-name" label="Name" required value={name} onChange={setName} error={attempted ? errors.name : undefined} autoComplete="off" disabled={saving} />
        <TextField
          id="cu-email"
          label="Email (used to log in)"
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
        <h3 className="text-heading-md text-foreground">Password</h3>
        <TextField
          id="cu-password"
          label="Password"
          required
          value={password}
          onChange={setPassword}
          error={attempted ? errors.password : undefined}
          hint="A strong one is made for you. Change it or generate another."
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
        />
        <div>
          <Button type="button" variant="outline" onClick={() => setPassword(generatePassword())} disabled={saving}>
            <RefreshCwIcon aria-hidden="true" />
            Generate another
          </Button>
        </div>
        <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-end" disabled={saving} aria-busy={saving}>
          {saving && <Spinner />}
          Create credentials
        </Button>
      </section>
    </form>
  );
}
