"use client";

import { useRef, useState, type ReactNode } from "react";
import { EyeIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { PageHeader } from "@/components/gate/page-header";
import { UserDrawer } from "@/components/admin/users/user-drawer";
import { useToast } from "@/components/gate/toast";
import { useAuth } from "@/lib/auth-store";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useHotkey } from "@/hooks/use-hotkey";
import type { LucideIcon } from "lucide-react";

const BODY = "h-[520px]";

/** What the create slot gets: enough to close itself and report a new row. */
export type CreateSlotCtx = {
  admin: string;
  close: () => void;
  /** Close the form, highlight the new row and show a toast. */
  created: (id: string, name: string, message?: string) => void;
};

/**
 * The shell every roster page shares: header with a Create toggle, an inline
 * create card above the table, search, and the table with loading, empty and
 * error states. Each role page only supplies its rows, columns and create form.
 */
export function RosterShell<T>({
  roleId,
  label,
  description,
  searchPlaceholder = "Name or email",
  emptyIcon = UsersIcon,
  emptyText,
  countLabel,
  load,
  columns,
  rowKey,
  rowName,
  viewRow,
  minWidth = 420,
  createHeading,
  createHint,
  renderCreate,
}: {
  roleId: string;
  label: string;
  description: string;
  searchPlaceholder?: string;
  emptyIcon?: LucideIcon;
  /** First argument is the active search text. */
  emptyText?: (q: string) => string;
  countLabel: (n: number) => string;
  load: (q: string) => Promise<T[]>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowName: (row: T) => string;
  /** When set, rows get a View action that opens the login's user drawer. */
  viewRow?: (row: T) => string | null;
  minWidth?: number;
  createHeading: string;
  createHint?: string;
  renderCreate: (ctx: CreateSlotCtx) => ReactNode;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const admin = user?.name ?? "Admin";
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const list = useLiveQuery(`roster:${roleId}:${q}`, () => load(q));
  useHotkey("/", () => searchRef.current?.focus());

  const rows = list.status === "ready" ? list.data : [];

  const rowActions = viewRow
    ? (row: T): RowAction[] => {
        const id = viewRow(row);
        return id ? [{ label: "View", icon: EyeIcon, onSelect: () => setOpenId(id) }] : [];
      }
    : undefined;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title={label}
        description={description}
        actions={
          creating ? (
            <Button variant="outline" onClick={() => setCreating(false)}>
              Close form
            </Button>
          ) : (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon aria-hidden="true" />
              Create
            </Button>
          )
        }
      />

      {creating && (
        <Card className="gap-6" aria-label={createHeading}>
          <div className="flex flex-col gap-1 px-(--card-spacing)">
            <h2 className="text-heading-md text-foreground">{createHeading}</h2>
            {createHint && <p className="text-sm text-muted-foreground">{createHint}</p>}
          </div>
          <div className="px-(--card-spacing)">
            {renderCreate({
              admin,
              close: () => setCreating(false),
              created: (id, name, message) => {
                setCreating(false);
                setHighlight(id);
                setTimeout(() => setHighlight((h) => (h === id ? null : h)), 3000);
                toast.push(message ?? `${name} added.`);
              },
            })}
          </div>
        </Card>
      )}

      <Card className="gap-4">
        <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={`roster-${roleId}-search`} className="text-sm text-foreground">
              Search
            </label>
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={`roster-${roleId}-search`}
                ref={searchRef}
                data-page-search
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                title="Search (/)"
                aria-keyshortcuts="/"
                autoComplete="off"
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <p role="status" aria-live="polite" className="px-(--card-spacing) text-sm tabular-nums text-muted-foreground">
          {list.status === "ready" ? countLabel(rows.length) : `Loading ${label}`}
        </p>

        <div className="px-(--card-spacing)">
          {list.status === "loading" && (
            <div className={BODY} role="status" aria-label={`Loading ${label}`}>
              <div className="flex h-10 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
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
              icon={emptyIcon}
              text={emptyText ? emptyText(q) : q ? "No matches." : `No ${label} yet.`}
              actionLabel={q ? "Clear search" : "Create"}
              onAction={() => (q ? setQ("") : setCreating(true))}
              className={BODY}
            />
          )}
          {list.status === "ready" && rows.length > 0 && (
            <DataTable
              id={`roster-${roleId}`}
              caption={label}
              columns={columns}
              rows={rows}
              rowKey={rowKey}
              highlightId={highlight}
              pageSize={10}
              minWidth={minWidth}
              actionLabel={viewRow ? (row) => `Actions for ${rowName(row)}` : undefined}
              actions={rowActions}
            />
          )}
        </div>
      </Card>

      {viewRow && <UserDrawer id={openId} admin={admin} onClose={() => setOpenId(null)} />}
    </div>
  );
}
