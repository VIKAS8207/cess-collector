import Link from "next/link";
import { useRouter } from "next/navigation";
import { TruckIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { Dwell } from "@/components/gate/dwell";
import type { Query } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import type { Movement } from "@/lib/domain/types";
import { formatTime } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[376px]";

export function InsideCard({
  query,
  onOpen,
}: {
  query: Query<Movement[]>;
  onOpen: (id: string) => void;
}) {
  const now = useNow(30_000);
  const router = useRouter();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Vehicles currently inside</CardTitle>
        <CardDescription>Longest stay first</CardDescription>
        <CardAction>
          <Link href="/vehicles?status=Inside" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading vehicles inside">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-14 items-center gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {query.status === "error" && <BlockError onRetry={query.retry} className={BODY} />}
        {query.status === "ready" && query.data.length === 0 && (
          <BlockEmpty
            icon={TruckIcon}
            text="No vehicles inside."
            actionLabel="Record an entry"
            onAction={() => router.push("/gate-entry?new=1")}
            className={BODY}
          />
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <div className={cn(BODY, "overflow-auto")}>
            <table className="w-full min-w-[480px]">
              <caption className="sr-only">Vehicles currently inside</caption>
              <thead>
                <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                  <th scope="col" className="font-normal">Vehicle</th>
                  <th scope="col" className="hidden font-normal sm:table-cell">Entry</th>
                  <th scope="col" className="font-normal">Dwell</th>
                  <th scope="col" className="w-24 text-right font-normal">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...query.data]
                  .sort((a, b) => a.entryAt! - b.entryAt!)
                  .map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => onOpen(m.id)}
                      className="h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted"
                    >
                      <th scope="row" className="py-1 text-left font-normal">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(m.id);
                          }}
                          className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="text-[15px] text-foreground">{m.plate || "No plate"}</span>
                          <span className="text-caption text-muted-foreground">{m.driverName}</span>
                        </button>
                      </th>
                      <td className="hidden text-caption tabular-nums text-muted-foreground sm:table-cell">
                        {formatTime(m.entryAt!)}
                      </td>
                      <td className="text-caption">
                        <Dwell ms={now ? now - m.entryAt! : null} />
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/gate-exit?q=${encodeURIComponent(m.plate || m.fastag)}`}
                          onClick={(e) => e.stopPropagation()}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Open exit
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
