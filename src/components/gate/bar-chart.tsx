import { cn } from "cn";

export type BarSeries = { name: string; values: number[]; className: string };

/**
 * Hand-built grouped bar chart. Uses percentage coordinates so it stretches to
 * any width without distorting text; labels are plain HTML.
 */
export function BarChart({
  labels,
  series,
  summary,
  height = 224,
  format = (n: number) => String(n),
  labelEvery = 1,
  axisWidth = 32,
}: {
  labels: string[];
  series: BarSeries[];
  summary: string;
  height?: number;
  format?: (n: number) => string;
  labelEvery?: number;
  axisWidth?: number;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const top = niceCeil(max);
  const n = labels.length;
  const groupW = 100 / n;
  const barGap = 0.06 * groupW;
  const barW = (groupW * 0.8) / series.length;
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div>
      <div className="flex gap-3" style={{ height }}>
        <div
          aria-hidden="true"
          style={{ width: axisWidth }}
          className="flex shrink-0 flex-col justify-between text-right text-caption tabular-nums text-muted-foreground"
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {format(Math.round(top * t * 10) / 10)}
            </span>
          ))}
        </div>
        <svg role="img" aria-label={summary} className="h-full min-w-0 flex-1 overflow-visible">
          {ticks.map((t) => (
            <line
              key={t}
              x1="0"
              x2="100%"
              y1={`${(1 - t) * 100}%`}
              y2={`${(1 - t) * 100}%`}
              strokeWidth="1"
              className="stroke-border"
            />
          ))}
          {labels.map((label, i) =>
            series.map((s, j) => {
              const h = (s.values[i] / top) * 100;
              return (
                <rect
                  key={`${label}-${s.name}`}
                  x={`${i * groupW + groupW * 0.1 + j * (barW + barGap)}%`}
                  y={`${100 - h}%`}
                  width={`${Math.max(barW - barGap, 0.2)}%`}
                  height={`${h}%`}
                  rx="2"
                  className={s.className}
                >
                  <title>{`${label}: ${s.name} ${format(s.values[i])}`}</title>
                </rect>
              );
            })
          )}
        </svg>
      </div>
      <div aria-hidden="true" className="mt-2 flex overflow-hidden" style={{ paddingLeft: axisWidth + 12 }}>
        {labels.map((l, i) => (
          <span
            key={`${l}-${i}`}
            className={cn(
              "min-w-0 flex-1 text-center text-caption whitespace-nowrap text-muted-foreground",
              i % labelEvery !== 0 && "invisible"
            )}
          >
            {i % labelEvery === 0 ? l : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function niceCeil(v: number) {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="flex items-center gap-4 text-caption text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("size-3 rounded-xs", i.className)} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
