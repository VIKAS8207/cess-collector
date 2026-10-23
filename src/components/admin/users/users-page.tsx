"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import type { AppUser } from "@/lib/domain/admin-types";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EyeIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { useToast } from "@/components/gate/toast";
import { CreateUserDrawer } from "@/components/admin/users/create-user";
import { UserDrawer } from "@/components/admin/users/user-drawer";
import { useAuth } from "@/lib/auth-store";
import { getUsers } from "@/lib/api/admin";
import { forcedErrors } from "@/lib/api/gate";
import { roleLabel, roles, type RoleId } from "@/lib/roles";
import { formatDate, formatStamp } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";

const userColumns: Column<AppUser>[] = [
  { key: "name", header: "Name", primary: true, cell: (u) => u.name },
  { key: "email", header: "Email", hideBelow: "xl", cell: (u) => <span className="text-caption text-muted-foreground">{u.email}</span> },
  { key: "role", header: "Role", cell: (u) => <Pill tone="brand">{roleLabel(u.role)}</Pill> },
  { key: "status", header: "Status", cell: (u) => <Pill tone={u.status === "active" ? "neutral" : "danger"}>{u.status === "active" ? "Active" : "Inactive"}</Pill> },
  { key: "created", header: "Created", hideBelow: "2xl", cell: (u) => <span className="text-caption tabular-nums text-muted-foreground">{formatDate(u.createdAt)}</span> },
  { key: "login", header: "Last login", hideBelow: "2xl", cell: (u) => <span className="text-caption tabular-nums text-muted-foreground">{u.lastLoginAt ? formatStamp(u.lastLoginAt) : "Never"}</span> },
];

const BODY = "h-[520px]";

export function UsersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const admin = user?.name ?? "Admin";
  const searchRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<RoleId | "">("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("user"));
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const list = useLiveQuery(`users:${role}:${status}:${q}`, (a) =>
    getUsers({ role: role || undefined, status: status || undefined, q }, { forceError: a === 0 && forcedErrors().has("users") })
  );
  useHotkey("/", () => searchRef.current?.focus());

  const rows = list.status === "ready" ? list.data : [];
  const filtered = !!role || !!status || !!q;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Users & Roles"
        description="Create users, set roles, and control who can log in."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden="true" />
            Create credentials
          </Button>
        }
      />

      <Card className="gap-4">
        <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2 xl:grid-cols-4">
          <SelectField id="us-role" label="Role" value={role} onChange={(v) => setRole(v as RoleId | "")} options={[{ value: "", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.label }))]} />
          <SelectField id="us-status" label="Status" value={status} onChange={(v) => setStatus(v as "" | "active" | "inactive")} options={[{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="us-search" className="text-sm text-foreground">Search</label>
            <div className="relative">
              <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="us-search" ref={searchRef} data-page-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" title="Search (/)" aria-keyshortcuts="/" autoComplete="off" className="pl-9" />
            </div>
          </div>
        </div>
        <p role="status" aria-live="polite" className="px-(--card-spacing) text-sm tabular-nums text-muted-foreground">
          {list.status === "ready" ? `${rows.length} users` : "Loading users"}
        </p>

        <div className="px-(--card-spacing)">
          {list.status === "loading" && (
            <div className={BODY} role="status" aria-label="Loading users">
              <div className="flex h-10 items-center"><Skeleton className="h-4 w-32" /></div>
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex h-14 items-center gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {list.status === "error" && <BlockError onRetry={list.retry} className={BODY} />}
          {list.status === "ready" && rows.length === 0 && (
            <BlockEmpty
              icon={UsersIcon}
              text="No users match."
              actionLabel={filtered ? "Clear filters" : "Create credentials"}
              onAction={() => {
                if (filtered) {
                  setRole("");
                  setStatus("");
                  setQ("");
                } else setCreating(true);
              }}
              className={BODY}
            />
          )}
          {list.status === "ready" && rows.length > 0 && (
            <DataTable
              id="us"
              caption="Users"
              columns={userColumns}
              rows={rows.map((r) => r.user)}
              rowKey={(u) => u.id}
              highlightId={highlight}
              pageSize={10}
              minWidth={420}
              actionLabel={(u) => `Actions for ${u.name}`}
              actions={(u) => [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(u.id) }]}
            />
          )}
        </div>
      </Card>

      <UserDrawer id={openId} admin={admin} onClose={() => setOpenId(null)} />
      <CreateUserDrawer
        open={creating}
        admin={admin}
        onClose={() => setCreating(false)}
        onCreated={(u) => {
          setCreating(false);
          setHighlight(u.id);
          setTimeout(() => setHighlight((h) => (h === u.id ? null : h)), 3000);
          toast.push(`${u.name} created as ${roleLabel(u.role)}.`);
        }}
      />
    </div>
  );
}
