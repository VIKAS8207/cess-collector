"use client";

import { useMemo } from "react";
import { encodeQr } from "@/lib/qr";
import type { Movement } from "@/lib/domain/types";

const QUIET = 2;

/** What the gate QR carries: entry number, vehicle and entry time. Always the same for one entry. */
export function qrPayload(m: Pick<Movement, "entryNo" | "plate" | "fastag" | "entryAt" | "createdAt">): string {
  const stamp = Math.floor((m.entryAt ?? m.createdAt) / 1000);
  return `SAS-GATE|${m.entryNo}|${m.plate || m.fastag}|${stamp}`;
}

export function QrCode({ value, size = 224, label }: { value: string; size?: number; label: string }) {
  const matrix = useMemo(() => encodeQr(value), [value]);
  const n = matrix.length;
  const path = useMemo(() => {
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    return d;
  }, [matrix, n]);
  const total = n + QUIET * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-field border border-border"
    >
      <rect width={total} height={total} className="fill-background" />
      <path d={path} className="fill-foreground" />
    </svg>
  );
}

/** Saves the QR as a PNG using the current theme colors. */
export function downloadQrPng(value: string, fileName: string) {
  const matrix = encodeQr(value);
  const n = matrix.length;
  const scale = 10;
  const total = n + QUIET * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = total * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--background").trim() || "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = css.getPropertyValue("--foreground").trim() || "black";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) ctx.fillRect((x + QUIET) * scale, (y + QUIET) * scale, scale, scale);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = fileName;
  a.click();
}
