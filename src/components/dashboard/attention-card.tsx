import Link from "next/link";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockError } from "@/components/dashboard/block-states";
import type { Query } from "@/hooks/use-live-query";
import { exceptionLabels, type ExceptionItem } from "@/lib/domain/types";
import { formatStamp } from "@/lib/format";
import { cn } from "cn";

const BODY = "h-[320px]";

export function AttentionCard({
  query,
  onOpen,
}: {
  query: Query<ExceptionItem[]>;
  onOpen: (movementId: string) => void;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-heading-md">Needs attention</CardTitle>
        <CardDescription>Open exceptions at your gate</CardDescription>
      </CardHeader>
      <div className="px-(--card-spacing)">
        {query.status === "loading" && (
          <div className={BODY} role="status" aria-label="Loading exceptions">
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
            <Link href="/vehicles" className={buttonVariants({ variant: "outline" })}>
              View all vehicles
            </Link>
          </div>
        )}
        {query.status === "ready" && query.data.length > 0 && (
          <ul className={cn(BODY, "overflow-y-auto")}>
            {query.data.map((item) => {
              const inner = (
                <>
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10"
                  >
                    <TriangleAlertIcon className="size-4 text-destructive" />
                  </span>
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="truncate text-[15px] text-foreground">
                      {item.plate || item.fastag || "Unknown vehicle"}
                      <span className="text-muted-foreground"> · {exceptionLabels[item.kind]}</span>
                    </span>
                    <span className="truncate text-caption text-muted-foreground">
                      {item.reason} {formatStamp(item.at)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={item.id} className="border-b border-border last:border-b-0">
                  {item.movementId ? (
                    <button
                      type="button"
                      onClick={() => onOpen(item.movementId!)}
                      className="flex min-h-16 w-full items-center gap-3 rounded-field px-1 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex min-h-16 items-center gap-3 px-1 py-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
