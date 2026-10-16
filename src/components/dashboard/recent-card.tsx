import { useRouter } from "next/navigation";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, ClockIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import type { Query } from "@/hooks/use-live-query";
import type { ActivityEvent } from "@/lib/api/gate";
import { formatStamp } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[376px]";

export function RecentCard({
  query,
  onOpen,
}: {
  query: Query<ActivityEvent[]>;
  onOpen: (id: string) => void;
}) {
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Recent activity</CardTitle>
        <CardDescription>Last 10 gate events</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading recent activity">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-14 items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty
            icon={ClockIcon}
            text="No activity yet."
            actionLabel="Record an entry"
            onAction={() => router.push("/gate-entry?new=1")}
            className={BODY}
          />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((e) => {
              const Icon = e.kind === "Entry" ? ArrowDownToLineIcon : ArrowUpFromLineIcon;
              return (
                <li key={e.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(e.movementId)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-field px-1 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag text-tag-foreground"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] text-foreground">
                        {e.kind} · {e.plate || e.fastag}
                      </span>
                      <span className="truncate text-caption text-muted-foreground">
                        {formatStamp(e.at)} · {e.operator}
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
