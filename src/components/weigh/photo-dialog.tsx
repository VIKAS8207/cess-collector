"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CameraIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Takes a photo of the truck on the weight bridge. Uses the device camera when there is one;
 * otherwise a simulated frame is captured so the flow can still be tested.
 */
export function PhotoDialog({
  open,
  title,
  hint = "Take a photo of the truck on the weight bridge.",
  onClose,
  onUse,
}: {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  onUse: (image: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-foreground/40 transition-opacity duration-200 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-print-hide
          className="fixed top-1/2 left-1/2 z-[80] flex max-h-[92vh] w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-border bg-background p-6 shadow-panel outline-none transition-[opacity,transform] duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
        >
          {open && <Body title={title} hint={hint} onUse={onUse} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ title, hint, onUse }: { title: string; hint: string; onUse: (image: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [feed, setFeed] = useState<"starting" | "live" | "simulated">("starting");
  const [shot, setShot] = useState<string | null>(null);

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

  const capture = () => {
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
        ctx.fillText("Simulated photo", canvas.width / 2, canvas.height / 2);
      }
    }
    setShot(canvas.toDataURL("image/jpeg", 0.6));
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Dialog.Title className="text-heading-lg text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {hint}
          </Dialog.Description>
        </div>
        <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="Close camera" />}>
          <XIcon aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div className="relative aspect-8/5 w-full overflow-hidden rounded-card border border-border bg-foreground">
        {!shot && (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera live view"
              className={feed === "live" ? "size-full object-cover" : "hidden"}
            />
            {feed !== "live" && (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-background">
                <CameraIcon aria-hidden="true" className="size-8" />
                <p className="text-sm">{feed === "starting" ? "Starting the camera" : "Simulated camera"}</p>
                {feed === "simulated" && (
                  <p className="text-caption opacity-80">No camera found, so this demo uses a simulated feed.</p>
                )}
              </div>
            )}
          </>
        )}
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="Captured weight bridge photo" className="size-full object-cover" />
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {!shot ? (
          <Button onClick={capture} disabled={feed === "starting"}>
            <CameraIcon aria-hidden="true" />
            Take photo
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setShot(null)}>
              Retake
            </Button>
            <Button onClick={() => onUse(shot)}>Use this photo</Button>
          </>
        )}
      </div>
    </>
  );
}
