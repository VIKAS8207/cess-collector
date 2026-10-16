import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLineIcon,
  BanIcon,
  BoxesIcon,
  CircleCheckIcon,
  ClockIcon,
  HandCoinsIcon,
  PackageXIcon,
  ShoppingCartIcon,
  TriangleAlertIcon,
  Undo2Icon,
  WalletIcon,
} from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { BuyerPill } from "@/components/trader/pills";
import type { Query } from "@/hooks/use-live-query";
import type { PendingRow, TraderAttention, TraderFeedItem } from "@/lib/api/trader";
import type { StockLine } from "@/lib/domain/trader-types";
import { formatInr, formatQty, formatStamp } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[376px]";

function RowSkeleton({ label }: { label: string }) {
  return (
    <div className={BODY} role="status" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-14 items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function StockWaitingCard({ query, onOpen }: { query: Query<StockLine[]>; onOpen: (id: string) => void }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Stock waiting to sell</CardTitle>
        <CardDescription>Oldest purchase first</CardDescription>
        <CardAction>
          <Link href="/my-stock" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <RowSkeleton label="Loading stock" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={BoxesIcon} text="No stock waiting to sell." actionLabel="Open My Stock" onAction={() => router.push("/my-stock")} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <div className={cn(BODY, "overflow-auto")}>
            <table className="w-full min-w-[520px]">
              <caption className="sr-only">Stock waiting to sell</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Item</th>
                  <th scope="col" className="text-right font-normal">Remaining</th>
                  <th scope="col" className="hidden text-right font-normal sm:table-cell">Rate</th>
                  <th scope="col" className="hidden pl-4 font-normal sm:table-cell">Source</th>
                  <th scope="col" className="w-32 text-right font-normal">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((s) => (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(s.id);
                        }}
                        className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="text-[15px] text-foreground">{s.item}</span>
                        <span className="text-caption text-muted-foreground">{s.unit}</span>
                      </button>
                    </th>
                    <td className="text-right text-[15px] tabular-nums text-foreground">
                      {formatQty(s.remaining)} {s.unit}
                    </td>
                    <td className="hidden text-right text-caption tabular-nums text-muted-foreground sm:table-cell">{formatInr(s.rate)}</td>
                    <td className="hidden pl-4 sm:table-cell">
                      <Pill tone="neutral">{s.source.kind === "agent" ? "From agent" : "Manual"}</Pill>
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/sales?stock=${s.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Record sale
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

export function PendingCard({ query }: { query: Query<PendingRow[]> }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Pending collections</CardTitle>
        <CardDescription>Oldest unpaid first</CardDescription>
        <CardAction>
          <Link href="/collections" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <RowSkeleton label="Loading pending collections" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={WalletIcon} text="No buyers with dues." actionLabel="Open Collections" onAction={() => router.push("/collections")} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <div className={cn(BODY, "overflow-auto")}>
            <table className="w-full min-w-[520px]">
              <caption className="sr-only">Pending collections</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Buyer</th>
                  <th scope="col" className="text-right font-normal">Total due</th>
                  <th scope="col" className="hidden text-right font-normal sm:table-cell">Oldest</th>
                  <th scope="col" className="w-36 text-right font-normal">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((r) => (
                  <tr key={r.buyer.id} className="h-14 border-b border-border last:border-b-0">
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      <span className="block text-[15px] text-foreground">{r.buyer.name}</span>
                      <span className="block text-caption tabular-nums text-muted-foreground">
                        Goods {formatInr(r.goodsDue)} · Saas {formatInr(r.saasDue)}
                      </span>
                    </th>
                    <td className="text-right text-[15px] tabular-nums text-foreground">{formatInr(r.totalDue)}</td>
                    <td className="hidden pl-4 text-right sm:table-cell">
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-caption tabular-nums text-muted-foreground">{r.since ? `${r.days} days` : "—"}</span>
                        <BuyerPill status={r.status} />
                      </span>
                    </td>
                    <td className="text-right">
                      <Link href={`/collections?buyer=${r.buyer.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Record payment
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

const attentionIcon = { overdue: HandCoinsIcon, "saas-adjust": TriangleAlertIcon, wastage: PackageXIcon, blocked: BanIcon } as const;

export function TraderAttentionCard({ query, onOpen }: { query: Query<TraderAttention[]>; onOpen: (a: TraderAttention) => void }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Needs attention</CardTitle>
        <CardDescription>Overdue buyers, saas adjustments, wastage</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <RowSkeleton label="Loading items that need attention" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <div className={cn(BODY, "flex flex-col items-center justify-center gap-3 text-center")}>
            <CircleCheckIcon aria-hidden="true" className="size-6 text-primary" />
            <p className="text-body-md text-muted-foreground">Nothing needs attention.</p>
            <Link href="/collections" className={buttonVariants({ variant: "outline" })}>
              Open Collections
            </Link>
          </div>
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((a) => {
              const Icon = attentionIcon[a.kind];
              return (
                <li key={a.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(a)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-field px-1 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                      <Icon className="size-4 text-destructive" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{a.title}</span>
                      <span className="truncate text-caption text-muted-foreground">
                        {a.detail} {formatStamp(a.at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

const feedIcon = { purchase: ArrowDownToLineIcon, sale: ShoppingCartIcon, return: Undo2Icon, payment: HandCoinsIcon } as const;

export function TraderRecentCard({ query, onOpen }: { query: Query<TraderFeedItem[]>; onOpen: (e: TraderFeedItem) => void }) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Recent activity</CardTitle>
        <CardDescription>Last 10 events</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && <RowSkeleton label="Loading recent activity" />}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={ClockIcon} text="No activity yet." actionLabel="Open Sales" onAction={() => router.push("/sales")} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((e) => {
              const Icon = feedIcon[e.kind];
              return (
                <li key={e.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(e)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-field px-1 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag text-tag-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">{e.text}</span>
                      <span className="truncate text-caption text-muted-foreground">{formatStamp(e.at)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
