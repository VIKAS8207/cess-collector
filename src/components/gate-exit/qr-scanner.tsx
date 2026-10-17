"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, CameraOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function detectorCtor(): DetectorCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
}

/**
 * Camera view that reads QR codes when the browser supports it (BarcodeDetector).
 * Where it does not, the page still works with a handheld scanner or the typed
 * field, which is how gate scanners normally deliver a code.
 */
export function QrScanner({ onScan, disabled }: { onScan: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const supported = !!detectorCtor();

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const Ctor = detectorCtor();
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => undefined);
        if (!Ctor) return;
        const detector = new Ctor({ formats: ["qr_code"] });
        timer = setInterval(async () => {
          if (video.readyState < 2) return;
          try {
            const found = await detector.detect(video);
            if (found[0]?.rawValue && !stopped) {
              stopped = true;
              onScan(found[0].rawValue);
              setOn(false);
            }
          } catch {
            /* keep trying */
          }
        }, 350);
      })
      .catch(() => {
        if (!stopped) {
          setProblem("The camera could not be opened. Use the scanner field instead.");
          setOn(false);
        }
      });
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onScan]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-8/5 w-full items-center justify-center overflow-hidden rounded-card border border-border bg-foreground">
        {on ? (
          <>
            <video ref={videoRef} muted playsInline aria-label="QR camera live view" className="size-full object-cover" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-card border-2 border-background/80" />
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-background">
            <CameraOffIcon aria-hidden="true" className="size-8" />
            <p className="text-sm">Camera is off</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setProblem(null);
            setOn((v) => !v);
          }}
          disabled={disabled}
        >
          <CameraIcon aria-hidden="true" />
          {on ? "Turn camera off" : "Scan with camera"}
        </Button>
        {!supported && (
          <p className="text-caption text-muted-foreground">
            This browser cannot read QR codes from the camera. Use a handheld scanner or the field below.
          </p>
        )}
      </div>
      {problem && (
        <p role="status" className="text-sm text-foreground">
          {problem}
        </p>
      )}
    </div>
  );
}
