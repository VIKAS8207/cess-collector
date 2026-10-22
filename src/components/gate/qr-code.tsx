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

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Prints a slip with just the QR and the entry details, in black on white, through a hidden frame. */
export function printQr(value: string, lines: { label: string; value: string }[]) {
  const matrix = encodeQr(value);
  const n = matrix.length;
  const total = n + QUIET * 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (matrix[y][x]) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
  const rows = lines.map((l) => `<tr><th>${esc(l.label)}</th><td>${esc(l.value || "—")}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Entry QR code</title><style>
    @page { margin: 12mm; }
    body { font-family: system-ui, sans-serif; color: #000; text-align: center; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 12px; font-weight: 400; }
    svg { width: 60mm; height: 60mm; display: block; margin: 0 auto 12px; }
    table { margin: 0 auto; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { font-weight: 400; color: #444; padding: 3px 14px 3px 0; }
    td { padding: 3px 0; }
  </style></head><body><h1>Entry QR code</h1>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>
  <table>${rows}</table></body></html>`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener("afterprint", () => frame.remove());
  setTimeout(() => {
    win.focus();
    win.print();
  }, 50);
}
