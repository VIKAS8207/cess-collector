"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { EllipsisVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "cn";

/**
 * The one table every list page uses: same header, row height, hairlines, three-dot
 * action menu and pager. A page only supplies columns, rows and (optionally) actions.
 */

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-align numbers and amounts. */
  align?: "right";
  /** The cell that names the row (plate, party, receipt). Rendered as the row header. */
  primary?: boolean;
  /** Hide the column below this container width so narrow screens stay readable. */
  hideBelow?: "md" | "lg" | "xl" | "2xl" | "4xl" | "5xl";
  className?: string;
};

export type RowAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  onSelect: () => void;
  disabled?: boolean;
};

const hide = {
  md: "hidden @md:table-cell",
  lg: "hidden @lg:table-cell",
  xl: "hidden @xl:table-cell",
  "2xl": "hidden @2xl:table-cell",
  "4xl": "hidden @4xl:table-cell",
  "5xl": "hidden @5xl:table-cell",
} as const;

const menuItem =
  "flex h-10 w-full cursor-default items-center gap-2 rounded-field px-3 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:opacity-50";

export const PAGE_SIZES = [10, 25, 50];

/** Range text, rows-per-page select and Previous / Next. Used by DataTable and by pages that page on the server. */
export function TablePager({
  id,
  page,
  pages,
  size,
  total,
  sizes = PAGE_SIZES,
  onPage,
  onSize,
}: {
  id: string;
  page: number;
  pages: number;
  size: number;
  total: number;
  sizes?: number[];
  onPage: (p: number) => void;
  onSize: (s: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
      <p className="text-sm tabular-nums text-muted-foreground">
        {(page - 1) * size + 1}-{Math.min(page * size, total)} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          id={`${id}-size`}
          label="Rows per page"
          hideLabel
          value={String(size)}
          onChange={(v) => onSize(Number(v))}
          options={sizes.map((n) => ({ value: String(n), label: `${n} per page` }))}
        />
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
      >
        <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} collisionPadding={12} className="z-50">
          <Menu.Popup className="min-w-44 rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-panel outline-none">
            {actions.map((a) => (
              <Menu.Item key={a.label} className={menuItem} disabled={a.disabled} onClick={a.onSelect}>
                {a.icon && <a.icon aria-hidden="true" className="size-4" />}
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function DataTable<T>({
  id,
  caption,
  columns,
  rows,
  rowKey,
  actions,
  actionLabel,
  highlightId,
  minWidth = 640,
  pageSize,
}: {
  /** Prefix for the pager's control ids. */
  id: string;
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Three-dot menu per row. Leave out for a read-only table. */
  actions?: (row: T) => RowAction[];
  actionLabel?: (row: T) => string;
  highlightId?: string | null;
  minWidth?: number;
  /** Turns on built-in paging. Leave out when the page pages on the server or shows a short list. */
  pageSize?: number;
}) {
  const [size, setSize] = useState(pageSize ?? 0);
  const [page, setPage] = useState(1);
  const [seen, setSeen] = useState(highlightId);
  // A freshly highlighted row (a new entry) is always at the top, so show the first page.
  if (highlightId !== seen) {
    setSeen(highlightId);
    if (highlightId) setPage(1);
  }
  const paged = size > 0;
  const total = rows.length;
  const pages = paged ? Math.max(1, Math.ceil(total / size)) : 1;
  const current = Math.min(page, pages);
  const visible = paged ? rows.slice((current - 1) * size, current * size) : rows;

  return (
    <div className="flex flex-col gap-4">
      <div className="@container overflow-x-auto">
        <table className="w-full text-[15px]" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn("pr-4 font-normal whitespace-nowrap", c.align === "right" && "text-right", c.hideBelow && hide[c.hideBelow])}
                >
                  {c.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="w-16 pr-0 text-right font-normal whitespace-nowrap print:hidden">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={cn(
                    "h-14 border-b border-border transition-colors duration-700 last:border-b-0 hover:bg-muted",
                    highlightId === key && "bg-tag/40"
                  )}
                >
                  {columns.map((c) => {
                    const cls = cn(
                      "pr-4",
                      c.align === "right" && "text-right tabular-nums",
                      c.hideBelow && hide[c.hideBelow],
                      c.className
                    );
                    return c.primary ? (
                      <th key={c.key} scope="row" className={cn(cls, "text-left font-normal whitespace-nowrap")}>
                        {c.cell(row)}
                      </th>
                    ) : (
                      <td key={c.key} className={cn(cls, "whitespace-nowrap")}>
                        {c.cell(row)}
                      </td>
                    );
                  })}
                  {actions && (
                    <td className="text-right print:hidden">
                      <div className="flex justify-end">
                        <RowMenu label={actionLabel ? actionLabel(row) : "Row actions"} actions={actions(row)} />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paged && (
        <TablePager
          id={id}
          page={current}
          pages={pages}
          size={size}
          total={total}
          onPage={setPage}
          onSize={(s) => {
            setSize(s);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
