"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusPill } from "@/components/gate/status-pill";
import { Dwell } from "@/components/gate/dwell";
import { useToast } from "@/components/gate/toast";
import { useAuth } from "@/lib/auth-store";
import { submitClearFlag } from "@/lib/api/gate";
import { getMovement, useStoreVersion } from "@/lib/domain/store";
import { formatStamp } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { cn } from "cn";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-caption text-muted-foreground sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-[15px] break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

function Step({ title, detail, done }: { title: string; detail: string; done: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 size-3 shrink-0 rounded-full border-2",
          done ? "border-primary bg-primary" : "border-input bg-background"
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] text-foreground">{title}</span>
        <span className="text-caption text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

/** Read-only record detail. `exitAction` replaces the default "Go to gate exit" link. */
export function MovementDrawer({
  id,
  onClose,
  exitAction,
}: {
  id: string | null;
  onClose: () => void;
  exitAction?: (plateOrTag: string) => void;
}) {
  useStoreVersion();
  const { user } = useAuth();
  const toast = useToast();
  const now = useNow(30_000);
  const m = id ? getMovement(id) : undefined;
  const [showFlag, setShowFlag] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clear = async () => {
    if (!m || clearing) return;
    setClearing(true);
    await submitClearFlag(m.id, user?.name ?? "Operator");
    setClearing(false);
    toast.push("Flag cleared.");
  };

  const dwell = m && m.entryAt ? (m.exitAt ?? now) - m.entryAt : null;
  const key = m ? m.plate || m.fastag : "";

  return (
    <Dialog.Root
      open={!!m}
      onOpenChange={(open) => {
        if (!open) {
          setShowFlag(false);
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-background shadow-panel outline-none transition-transform duration-200 data-[starting-style]:translate-x-full"
        >
          {m && (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-border p-6">
                <div className="flex min-w-0 flex-col gap-2">
                  <Dialog.Title className="text-heading-lg break-all text-foreground">
                    {m.plate || "No plate"}
                  </Dialog.Title>
                  <Dialog.Description className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                    <StatusPill movement={m} />
                    <span>{m.entryNo}</span>
                    <span>{m.gate}</span>
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  render={<Button variant="ghost" size="icon" aria-label="Close details" title="Close (Esc)" />}
                >
                  <XIcon aria-hidden="true" />
                </Dialog.Close>
              </div>

              <div className="flex flex-1 flex-col gap-8 overflow-y-auto p-6">
                {m.flag && (
                  <section className="rounded-field border border-border bg-muted p-4">
                    <button
                      type="button"
                      aria-expanded={showFlag}
                      onClick={() => setShowFlag((v) => !v)}
                      className="flex min-h-10 w-full items-center justify-between rounded-full text-left text-[15px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      View flag reason
                      <ChevronDownIcon
                        aria-hidden="true"
                        className={cn("size-4 transition-transform", showFlag && "rotate-180")}
                      />
                    </button>
                    {showFlag && (
                      <p className="pt-2 text-sm text-foreground">
                        {m.flag.reason}
                        {m.flag.clearedAt &&
                          ` Cleared by ${m.flag.clearedBy} on ${formatStamp(m.flag.clearedAt)}.`}
                      </p>
                    )}
                  </section>
                )}

                <section aria-labelledby="d-details" className="flex flex-col gap-4">
                  <h3 id="d-details" className="text-heading-md text-foreground">
                    Vehicle and trip
                  </h3>
                  <dl className="flex flex-col gap-3">
                    <Row label="FASTag" value={m.fastag || (m.noFastag ? "No FASTag" : "")} />
                    <Row label="Vehicle type" value={m.vehicleType} />
                    <Row label="Vehicle class" value={m.vehicleClass} />
                    <Row label="Driver" value={m.driverName} />
                    <Row label="Driver phone" value={m.driverPhone} />
                    <Row label="Transporter" value={m.transporter} />
                    <Row label="Purpose" value={m.purpose} />
                    <Row label="Reference" value={m.reference} />
                    <Row label="Remarks" value={m.remarks} />
                  </dl>
                </section>

                <section aria-labelledby="d-timeline" className="flex flex-col gap-4">
                  <h3 id="d-timeline" className="text-heading-md text-foreground">
                    Timeline
                  </h3>
                  <ol>
                    <Step
                      done={!!m.entryAt}
                      title="Entry stamped"
                      detail={m.entryAt ? `${formatStamp(m.entryAt)} by ${m.operator}` : "No entry on record"}
                    />
                    <Step
                      done={!!m.exitAt}
                      title={m.exitAt ? "Exit approved" : "Exit pending"}
                      detail={
                        m.exitAt
                          ? `${formatStamp(m.exitAt)} by ${m.exitOperator ?? m.operator}`
                          : m.status === "Inside"
                            ? "Vehicle is still inside"
                            : "No exit on record"
                      }
                    />
                  </ol>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    Dwell time <Dwell ms={dwell} open={m.status === "Inside"} />
                  </p>
                </section>

                <section aria-labelledby="d-audit" className="flex flex-col gap-4">
                  <h3 id="d-audit" className="text-heading-md text-foreground">
                    Audit trail
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {[...m.audit].reverse().map((a, i) => (
                      <li key={i} className="flex flex-col text-sm">
                        <span className="text-foreground">
                          {a.action}
                          {a.note ? ` · ${a.note}` : ""}
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {formatStamp(a.at)} · {a.by} · {m.gate}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {(m.status === "Inside" || (m.flag && !m.flag.clearedAt)) && (
                <div className="flex flex-wrap gap-3 border-t border-border p-6">
                  {m.status === "Inside" &&
                    (exitAction ? (
                      <Button
                        onClick={() => {
                          exitAction(key);
                          onClose();
                        }}
                      >
                        Go to gate exit
                      </Button>
                    ) : (
                      <Link
                        href={`/gate-exit?q=${encodeURIComponent(key)}`}
                        className={buttonVariants()}
                      >
                        Go to gate exit
                      </Link>
                    ))}
                  {m.flag && !m.flag.clearedAt && (
                    <Button variant="outline" onClick={clear} disabled={clearing} aria-busy={clearing}>
                      {clearing && <Spinner />}
                      Clear flag
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
