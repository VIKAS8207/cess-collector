"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CameraIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/auth/text-field";
import { readCamera } from "@/lib/api/gate";

export type CameraKind = "plate" | "fastag";

const copy: Record<CameraKind, { title: string; where: string; field: string; sim: string }> = {
  plate: {
    title: "Plate camera",
    where: "Point the camera at the number plate.",
    field: "Plate number read",
    sim: "Simulated plate camera",
  },
  fastag: {
    title: "Front camera",
    where: "Point the camera at the FASTag on the windscreen.",
    field: "FASTag ID read",
    sim: "Simulated front camera",
  },
};

/**
 * Captures a frame from the gate camera and reads the plate or FASTag from it.
 * The live preview uses the device camera when there is one; otherwise a
 * simulated feed is used. Reading the text is simulated (see readCamera).
 */
export function CameraDialog({
  kind,
  onClose,
  onUse,
}: {
  kind: CameraKind | null;
  onClose: () => void;
  onUse: (kind: CameraKind, value: string, image: string) => void;
}) {
  return (
    <Dialog.Root open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex max-h-[92vh] w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {kind && <Body key={kind} kind={kind} onUse={onUse} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ kind, onUse }: { kind: CameraKind; onUse: (k: CameraKind, v: string, image: string) => void }) {
  const c = copy[kind];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [feed, setFeed] = useState<"starting" | "live" | "simulated">("starting");
  const [phase, setPhase] = useState<"live" | "reading" | "done">("live");
  const [shot, setShot] = useState<string | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      queueMicrotask(() => !stopped && setFeed("simulated"));
      return;
    }
    media
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
        setFeed("live");
      })
      .catch(() => !stopped && setFeed("simulated"));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;
    if (ctx) {
      const css = getComputedStyle(document.documentElement);
      if (feed === "live" && video && video.videoWidth) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = css.getPropertyValue("--foreground").trim() || "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = css.getPropertyValue("--background").trim() || "white";
        ctx.font = "20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(c.sim, canvas.width / 2, canvas.height / 2);
      }
    }
    setShot(canvas.toDataURL("image/jpeg", 0.6));
    setPhase("reading");
    setValue(await readCamera(kind));
    setPhase("done");
  };

  const retake = () => {
    setShot(null);
    setValue("");
    setPhase("live");
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Dialog.Title className="text-heading-lg text-foreground">{c.title}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">{c.where}</Dialog.Description>
        </div>
        <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close camera" />}>
          <XIcon aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div className="relative aspect-8/5 w-full overflow-hidden rounded-card border border-border bg-foreground">
        {phase === "live" && (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label={`${c.title} live view`}
              className={feed === "live" ? "size-full object-cover" : "hidden"}
            />
            {feed !== "live" && (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-background">
                <CameraIcon aria-hidden="true" className="size-8" />
                <p className="text-sm">{feed === "starting" ? "Starting the camera" : c.sim}</p>
                {feed === "simulated" && (
                  <p className="text-caption opacity-80">No camera found, so this demo uses a simulated feed.</p>
                )}
              </div>
            )}
          </>
        )}
        {phase !== "live" && shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt={`Captured ${kind === "plate" ? "number plate" : "FASTag"} frame`} className="size-full object-cover" />
        )}
        {phase === "reading" && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/60 text-background">
            <Spinner />
            <span className="text-sm">Reading</span>
          </div>
        )}
      </div>

      {phase === "done" && (
        <div className="flex flex-col gap-2">
          <TextField
            id="cam-result"
            label={c.field}
            value={value}
            onChange={(v) => setValue(kind === "plate" ? v.toUpperCase() : v)}
            autoComplete="off"
            hint="Check it matches the vehicle. You can correct it here."
          />
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        {phase === "live" && (
          <Button onClick={capture} disabled={feed === "starting"}>
            <CameraIcon aria-hidden="true" />
            Capture
          </Button>
        )}
        {phase === "reading" && (
          <Button disabled aria-busy="true">
            <Spinner />
            Reading
          </Button>
        )}
        {phase === "done" && (
          <>
            <Button variant="outline" onClick={retake}>
              Retake
            </Button>
            <Button onClick={() => onUse(kind, value.trim(), shot ?? "")} disabled={!value.trim()}>
              Use this
            </Button>
          </>
        )}
      </div>
      <p className="text-caption text-muted-foreground">
        Reading the text is simulated in this demo. A real plate or FASTag reader replaces it later.
      </p>
    </>
  );
}
