import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLineIcon,
  BanIcon,
  CircleCheckIcon,
  ClockIcon,
  HandCoinsIcon,
  PackageIcon,
  ShoppingCartIcon,
  SplitIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { ReceiptPills } from "@/components/agent/pills";
import type { Query } from "@/hooks/use-live-query";
import type { AgentAttention, WaitingLot } from "@/lib/api/agent";
import type { AgentEvent } from "@/lib/domain/agent-types";
import { formatStamp, formatTime } from "@/lib/format";
import { cn } from "cn";

export function WaitingCard({ query, onOpen }: { query: Query<WaitingLot[]>; onOpen: (id: string) => void }) {
  const router = useRouter();
  const BODY = "h-[376px]";
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Waiting for sale</CardTitle>
        <CardDescription>Oldest lot first</CardDescription>
        <CardAction>
          <Link href="/sales" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading lots waiting for sale">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-14 items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={PackageIcon} text="No stock waiting for sale." actionLabel="Allocate to traders" onAction={() => router.push("/allocations")} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <div className={cn(BODY, "overflow-auto")}>
            <table className="w-full min-w-[560px]">
              <caption className="sr-only">Lots waiting for sale</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Vehicle</th>
                  <th scope="col" className="font-normal">Items</th>
                  <th scope="col" className="hidden font-normal sm:table-cell">Received</th>
                  <th scope="col" className="text-right font-normal">Left</th>
                  <th scope="col" className="w-32 text-right font-normal">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((lot) => (
                  <tr
                    key={lot.receipt.id}
                    onClick={() => onOpen(lot.receipt.id)}
                    className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted"
                  >
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(lot.receipt.id);
                        }}
                        className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="text-[15px] text-foreground">{lot.receipt.plate || "No plate"}</span>
                        <span className="text-caption text-muted-foreground">{lot.receipt.no}</span>
                      </button>
                    </th>
                    <td className="max-w-48 truncate pr-3 text-caption text-muted-foreground">{lot.summary}</td>
                    <td className="hidden pr-3 text-caption tabular-nums text-muted-foreground sm:table-cell">
                      {formatTime(lot.receipt.receivedAt)}
                    </td>
                    <td className="pr-3 text-right text-caption tabular-nums text-foreground">{lot.left}</td>
                    <td className="text-right">
                      <Link
                        href={`/sales?receipt=${lot.receipt.id}`}
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

const attentionIcon = {
  mismatch: TriangleAlertIcon,
  stale: ClockIcon,
  overdue: HandCoinsIcon,
  blocked: BanIcon,
} as const;

export function AgentAttentionCard({
  query,
  onOpenReceipt,
}: {
  query: Query<AgentAttention[]>;
  onOpenReceipt: (id: string) => void;
}) {
  const router = useRouter();
  const BODY = "h-[376px]";
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Needs attention</CardTitle>
        <CardDescription>Mismatches, stale lots, overdue balances</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading items that need attention">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex h-16 items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <div className={cn(BODY, "flex flex-col items-center justify-center gap-3 text-center")}>
            <CircleCheckIcon aria-hidden="true" className="size-6 text-primary" />
            <p className="text-body-md text-muted-foreground">Nothing needs attention.</p>
            <Link href="/sales" className={buttonVariants({ variant: "outline" })}>
              Open Sales
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
                    onClick={() =>
                      a.kind === "overdue" && a.partyId
                        ? router.push("/report")
                        : a.receiptId
                          ? onOpenReceipt(a.receiptId)
                          : undefined
                    }
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

const eventIcon = {
  received: ArrowDownToLineIcon,
  sold: ShoppingCartIcon,
  returned: Undo2Icon,
  paid: HandCoinsIcon,
  blocked: BanIcon,
  allocated: SplitIcon,
} as const;

export function AgentRecentCard({
  query,
  onOpen,
}: {
  query: Query<AgentEvent[]>;
  onOpen: (e: AgentEvent) => void;
}) {
  const router = useRouter();
  const BODY = "h-[376px]";
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Recent activity</CardTitle>
        <CardDescription>Last 10 events</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading recent activity">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-14 items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty icon={ClockIcon} text="No activity yet." actionLabel="Allocate to traders" onAction={() => router.push("/allocations")} className={BODY} />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((e) => {
              const Icon = eventIcon[e.kind];
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

export { ReceiptPills };
