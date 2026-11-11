"use client";

import { useState } from "react";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import { type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { CreateUserForm } from "@/components/admin/users/create-user";
import { ProfileForm } from "@/components/admin/roles/profile-form";
import { RosterShell, type CreateSlotCtx, type EditSlotCtx } from "@/components/admin/roles/roster-shell";
import {
  getRoleProfiles,
  submitCreateRoleProfile,
  submitDeleteRoleProfile,
  submitUpdateRoleProfile,
  type ProfileRow,
} from "@/lib/api/admin";
import { profileConfigs, profileFields, type ProfileRoleId } from "@/lib/domain/role-profiles";
import { formatDate } from "@/lib/format";

function columnsFor(role: ProfileRoleId): Column<ProfileRow>[] {
  const fields = profileFields(role).filter((f) => f.column);
  return [
    { key: "name", header: "Name", primary: true, cell: (r) => r.name },
    ...fields.map((f, i): Column<ProfileRow> => ({
      key: f.key,
      header: f.label,
      hideBelow: i === 0 ? undefined : i === 1 ? "lg" : "xl",
      cell: (r) => <span className="text-caption text-muted-foreground">{r.values[f.key] || "—"}</span>,
    })),
    {
      key: "created",
      header: "Created",
      hideBelow: "2xl",
      cell: (r) => <span className="text-caption tabular-nums text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
  ];
}

/**
 * The roster page for a role with its own profile form: the people registered
 * with that role, and a two-step Create (details for the role, then the login).
 * Used by every page under /roles.
 */
export function RoleRosterPage({ roleId, label }: { roleId: ProfileRoleId; label: string }) {
  const columns = columnsFor(roleId);
  return (
    <RosterShell<ProfileRow>
      roleId={roleId}
      label={label}
      description={`People registered as ${label}.`}
      searchPlaceholder="Name, mobile or any detail"
      emptyIcon={UsersIcon}
      emptyText={(q) => (q ? "No people match." : `No ${label} registered yet.`)}
      countLabel={(n) => `${n} ${n === 1 ? "person" : "people"}`}
      load={(q) => getRoleProfiles(roleId, { q })}
      columns={columns}
      rowKey={(r) => r.id}
      rowName={(r) => r.name}
      viewRow={(r) => r.userId}
      minWidth={520}
      createHeading={`Create ${label}`}
      createHint="First the details, then the login credentials."
      renderCreate={(ctx) => <ProfileCreate roleId={roleId} label={label} ctx={ctx} />}
      renderEdit={(row, ctx) => <ProfileEdit key={row.id} roleId={roleId} row={row} ctx={ctx} />}
      onDelete={(row, admin) => submitDeleteRoleProfile(row.id, row.userId, admin)}
      deleteMessage={(row) => `${row.name} and their login will be removed. Records they made stay as history. This cannot be undone.`}
    />
  );
}

function ProfileEdit({ roleId, row, ctx }: { roleId: ProfileRoleId; row: ProfileRow; ctx: EditSlotCtx }) {
  const [busy, setBusy] = useState(false);
  return (
    <ProfileForm
      role={roleId}
      initial={{ ...row.values, name: row.name }}
      submitLabel="Save changes"
      busy={busy}
      onCancel={ctx.close}
      onNext={async (values) => {
        setBusy(true);
        await submitUpdateRoleProfile(roleId, row.id, values, ctx.admin);
        setBusy(false);
        ctx.saved(`${values.name} updated.`);
      }}
    />
  );
}

/** Step 1 stays mounted while step 2 is open, so Back keeps every entry. */
export function ProfileCreate({ roleId, label, ctx }: { roleId: ProfileRoleId; label: string; ctx: CreateSlotCtx }) {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const summary = values
    ? profileFields(roleId)
        .filter((f) => f.column && values[f.key])
        .map((f) => values[f.key])
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div hidden={values !== null} className="flex flex-col gap-4">
        <p role="status" className="text-caption text-muted-foreground">
          Step 1 of 2 · {profileConfigs[roleId].noun} details
        </p>
        <ProfileForm role={roleId} onNext={setValues} onCancel={ctx.close} />
      </div>

      {values && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-caption text-muted-foreground">
              Step 2 of 2 · Login credentials
            </p>
            <Button variant="outline" size="sm" onClick={() => setValues(null)}>
              <ArrowLeftIcon aria-hidden="true" />
              Back to details
            </Button>
          </div>
          <p className="rounded-field bg-muted px-3 py-3 text-sm text-muted-foreground">{[values.name, ...summary.filter((s) => s !== values.name)].join(" · ")}</p>
          <CreateUserForm
            admin={ctx.admin}
            lockedRole={roleId}
            initialName={values.name}
            onCancel={() => setValues(null)}
            onDone={async (u) => {
              const record = await submitCreateRoleProfile(roleId, { ...values, name: u.name }, u.id, ctx.admin);
              ctx.created(record.id, record.name, `${record.name} created as ${label}.`);
            }}
          />
        </>
      )}
    </div>
  );
}
