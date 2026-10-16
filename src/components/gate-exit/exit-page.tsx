"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InfoIcon, PlusIcon, SearchIcon, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { BlockEmpty, BlockError } from "@/components/dashboard/block-states";
import { Dwell } from "@/components/gate/dwell";
import { PageHeader } from "@/components/gate/page-header";
import { StatusPill } from "@/components/gate/status-pill";
import { MovementDrawer } from "@/components/gate/movement-drawer";
import { useToast } from "@/components/gate/toast";
import { RevealPanel, useReveal } from "@/components/gate/reveal-panel";
import { useAuth } from "@/lib/auth-store";
import { forcedErrors, getInside, lookupClosed, submitExit, submitFlag } from "@/lib/api/gate";
import { normalizeId } from "@/lib/domain/store";
import type { Movement } from "@/lib/domain/types";
import { formatDate, formatDuration, formatStamp, formatTime } from "@/lib/format";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { useHotkey } from "@/hooks/use-hotkey";
import { cn } from "cn";

const BODY = "h-[480px]";

type Panel = { kind: "none"; q: string } | { kind: "exited"; movement: Movement } | null;

export function ExitPage() {
  const { user } = useAuth();
  const toast = useToast();
  const operator = user?.name ?? "Operator";
  const now = useNow(15_000);
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const searchRef = useRef<HTMLInputElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const reveal = useReveal("exit-search", !!urlQuery);

  const [query, setQuery] = useState(urlQuery);
  const [fromUrl, setFromUrl] = useState(!!urlQuery);
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [checking, setChecking] = useState(false);
  const [approving, setApproving] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const inside = useLiveQuery("inside", (attempt) =>
    getInside({ forceError: attempt === 0 && forcedErrors().has("inside") })
  );

  const q = normalizeId(query);
  const all = inside.status === "ready" ? inside.data : [];
  const matches = q
    ? all.filter((m) => normalizeId(m.plate).includes(q) || normalizeId(m.fastag).includes(q))
    : [];
  const exact = matches.filter((m) => normalizeId(m.plate) === q || normalizeId(m.fastag) === q);
  const selected =
    all.find((m) => m.id === picked) ?? (fromUrl && matches.length === 1 ? matches[0] : null);

  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };
  useHotkey("/", () => (reveal.expanded ? focusSearch() : startNew()));

  const clear = () => {
    setQuery("");
    setFromUrl(false);
    setPicked(null);
    setPanel(null);
  };

  /** Back to step 1 while the form stays open. */
  const reset = () => {
    clear();
    requestAnimationFrame(focusSearch);
  };

  /** "New gate exit": a fresh form, slid open. */
  function startNew() {
    clear();
    reveal.open();
  }

  /** Done with this vehicle: slide the form away. */
  const finish = () => {
    clear();
    reveal.close();
    newButton.current?.focus();
  };

  const choose = (m: Movement) => {
    setPicked(m.id);
    setPanel(null);
  };

  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!q || checking) return;
    const target = exact[0] ?? matches[0];
    if (target) {
      choose(target);
      return;
    }
    setChecking(true);
    const found = await lookupClosed(query);
    setChecking(false);
    setPanel(found.kind === "exited" ? { kind: "exited", movement: found.movement } : { kind: "none", q: query.trim().toUpperCase() });
  };

  const approve = async () => {
    if (!selected || approving) return;
    setApproving(true);
    const done = await submitExit(selected.id, operator);
    setApproving(false);
    if (done) {
      toast.push(`Exit approved for ${done.plate || done.fastag}.`);
      finish();
    } else {
      toast.push("This vehicle is no longer inside.", "error");
      finish();
    }
  };

  const flag = async () => {
    if (panel?.kind !== "none" || flagging) return;
    setFlagging(true);
    await submitFlag(panel.q, operator);
    setFlagging(false);
    toast.push(`${panel.q} flagged for a supervisor.`);
    finish();
  };

  const tableRows = q ? matches : all;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <PageHeader
        title="Gate Exit"
        description="Find the truck, check its entry, then approve the exit."
        actions={
          <Button
            ref={newButton}
            onClick={startNew}
            aria-expanded={reveal.expanded}
            aria-controls="exit-form-panel"
            title="New gate exit"
          >
            <PlusIcon aria-hidden="true" />
            New gate exit
          </Button>
        }
      />

      <RevealPanel id="exit-form-panel" mounted={reveal.mounted} expanded={reveal.expanded} title="New gate exit" onCancel={finish}>
        <Card className="gap-0 p-0 [--card-spacing:--spacing(6)]">
          <div className="flex flex-col gap-8 p-6">
            <section className="flex flex-col gap-3" aria-labelledby="x-search">
              <h2 id="x-search" className="text-[17px] tracking-[-0.2px] text-foreground">
                1. Find the vehicle
              </h2>
              <label htmlFor="exit-search" className="sr-only">
                Plate number or FASTag ID
              </label>
              <div className="relative">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="exit-search"
                  ref={searchRef}
                  data-page-search
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value.toUpperCase());
                    setFromUrl(false);
                    setPicked(null);
                    setPanel(null);
                  }}
                  onKeyDown={onSearchKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Scan or type plate / FASTag"
                  title="Search (/)"
                  aria-keyshortcuts="/"
                  className="h-14 pr-12 pl-12 text-xl tracking-wider"
                />
                {checking && (
                  <Spinner className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              <p className="text-caption text-muted-foreground">
                Press Enter to pick the top match. Press / to search from anywhere on this page.
              </p>

              {q && !selected && matches.length > 0 && (
                <ul aria-label="Matching vehicles" className="flex flex-col divide-y divide-border rounded-field border border-border">
                  {matches.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => choose(m)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[15px] text-foreground">{m.plate || m.fastag}</span>
                          <span className="truncate text-caption text-muted-foreground">
                            {m.driverName} · in at {formatTime(m.entryAt!)}
                          </span>
                        </span>
                        <Dwell ms={now ? now - m.entryAt! : null} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {q && !selected && inside.status === "ready" && matches.length === 0 && !panel && (
                <p role="status" className="text-sm text-muted-foreground">
                  No vehicle inside matches {query}. Press Enter to check the records.
                </p>
              )}
            </section>

            {panel?.kind === "none" && (
              <section
                role="status"
                className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5"
              >
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  No open entry found for {panel.q}.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={reset}>
                    Re-check details
                  </Button>
                  <Button variant="outline" onClick={flag} disabled={flagging} aria-busy={flagging}>
                    {flagging && <Spinner />}
                    Flag for supervisor
                  </Button>
                </div>
              </section>
            )}

            {panel?.kind === "exited" && (
              <section
                role="status"
                className="flex flex-col gap-4 rounded-card border border-border bg-muted p-5"
              >
                <p className="flex items-start gap-2 text-[15px] text-foreground">
                  <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  {panel.movement.plate || panel.movement.fastag} already exited on{" "}
                  {formatDate(panel.movement.exitAt!)} at {formatTime(panel.movement.exitAt!)}, after{" "}
                  {formatDuration(panel.movement.exitAt! - panel.movement.entryAt!)}.
                </p>
                <div>
                  <Button variant="outline" onClick={reset}>
                    Search again
                  </Button>
                </div>
              </section>
            )}

            {selected && (
              <>
                <section className="flex flex-col gap-4" aria-labelledby="x-check">
                  <h2 id="x-check" className="text-[17px] tracking-[-0.2px] text-foreground">
                    2. Check the entry
                  </h2>
                  <div className="rounded-card border border-border p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-heading-lg text-foreground">{selected.plate || "No plate"}</p>
                      <StatusPill movement={selected} />
                    </div>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Item label="FASTag" value={selected.fastag || "No FASTag"} />
                      <Item label="Driver" value={selected.driverName} />
                      <Item label="Vehicle type" value={selected.vehicleType} />
                      <Item label="Transporter" value={selected.transporter} />
                      <Item label="Entry time" value={formatStamp(selected.entryAt!)} />
                      <Item label="Entry reference" value={`${selected.entryNo}${selected.reference ? ` · ${selected.reference}` : ""}`} />
                      <div className="sm:col-span-2">
                        <dt className="text-caption text-muted-foreground">Time inside</dt>
                        <dd className="mt-1 text-[15px]">
                          <Dwell ms={now ? now - selected.entryAt! : null} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
                <section className="flex flex-col gap-3" aria-labelledby="x-approve">
                  <h2 id="x-approve" className="text-[17px] tracking-[-0.2px] text-foreground">
                    3. Approve
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="lg" onClick={approve} disabled={approving} aria-busy={approving}>
                      {approving && <Spinner />}
                      {approving ? "Approving" : "Approve exit"}
                    </Button>
                    <Button variant="ghost" size="lg" onClick={reset} disabled={approving}>
                      Choose a different vehicle
                    </Button>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    The exit time and your name are stamped automatically.
                  </p>
                </section>
              </>
            )}
          </div>
        </Card>
      </RevealPanel>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-heading-md">Vehicles currently inside</CardTitle>
            <CardDescription>
              {inside.status === "ready"
                ? q
                  ? `${tableRows.length} of ${all.length} match`
                  : `${all.length} inside`
                : "Longest stay first"}
            </CardDescription>
          </CardHeader>
          <div className="px-(--card-spacing)">
            {inside.status === "loading" && (
              <div className={BODY} role="status" aria-label="Loading vehicles inside">
                <div className="flex h-10 items-center">
                  <Skeleton className="h-4 w-24" />
                </div>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex h-14 items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}
            {inside.status === "error" && <BlockError onRetry={inside.retry} className={BODY} />}
            {inside.status === "ready" && all.length === 0 && (
              <BlockEmpty
                icon={TruckIcon}
                text="No vehicles inside."
                actionLabel="New gate exit"
                onAction={startNew}
                className={BODY}
              />
            )}
            {inside.status === "ready" && all.length > 0 && tableRows.length === 0 && (
              <BlockEmpty
                icon={SearchIcon}
                text="No vehicle inside matches your search."
                actionLabel="Clear search"
                onAction={clear}
                className={BODY}
              />
            )}
            {inside.status === "ready" && tableRows.length > 0 && (
              <div className={cn(BODY, "@container overflow-auto")}>
                <table className="w-full min-w-[320px]">
                  <caption className="sr-only">Vehicles currently inside</caption>
                  <thead>
                    <tr className="h-10 border-b border-border text-left text-caption text-muted-foreground">
                      <th scope="col" className="font-normal">Vehicle</th>
                      <th scope="col" className="hidden font-normal @md:table-cell">Entry</th>
                      <th scope="col" className="font-normal">Dwell</th>
                      <th scope="col" className="hidden font-normal @xl:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...tableRows]
                      .sort((a, b) => a.entryAt! - b.entryAt!)
                      .map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => setOpenId(m.id)}
                          className={cn(
                            "h-14 cursor-pointer border-b border-border last:border-b-0 hover:bg-muted",
                            selected?.id === m.id && "bg-tag/40"
                          )}
                        >
                          <th scope="row" className="py-1 pr-3 text-left font-normal">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenId(m.id);
                              }}
                              className="flex flex-col rounded-field text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <span className="text-[15px] text-foreground">{m.plate || "No plate"}</span>
                              <span className="max-w-40 truncate text-caption text-muted-foreground">
                                {m.driverName}
                              </span>
                            </button>
                          </th>
                          <td className="hidden pr-3 text-caption tabular-nums text-muted-foreground @md:table-cell">
                            {formatTime(m.entryAt!)}
                          </td>
                          <td className="pr-3 text-caption">
                            <Dwell ms={now ? now - m.entryAt! : null} />
                          </td>
                          <td className="hidden @xl:table-cell">
                            <StatusPill movement={m} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

      <MovementDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        exitAction={(key) => {
          setQuery(key);
          setFromUrl(true);
          setPicked(null);
          setPanel(null);
          if (!reveal.expanded) reveal.open();
        }}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-[15px] break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}
