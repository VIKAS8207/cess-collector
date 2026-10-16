/** Decorative geometric panel. Colors come from design tokens only. */
export function LoginArt() {
  return (
    <svg
      viewBox="0 0 460 640"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="size-full"
    >
      {/* Row 1 */}
      <svg x="0" y="0" width="155" height="150">
        <rect width="155" height="150" className="fill-chart-2" />
        <path d="M0 150V70a38 38 0 0 1 76 0v80z" className="fill-primary" />
        <path d="M79 150V70a38 38 0 0 1 76 0v80z" className="fill-primary-deep" />
        <path d="M0 150V100a38 38 0 0 1 76 0v50z" className="fill-tag/40" />
      </svg>
      <svg x="155" y="0" width="155" height="150">
        <rect width="155" height="150" className="fill-foreground" />
        <path d="M30 30l14-14 14 14-14 14zM58 30l14-14 14 14-14 14z" className="fill-chart-4" />
        <path d="M44 16l14 14-14 14-14-14z" className="fill-chart-5" />
        <rect x="26" y="62" width="104" height="6" className="fill-chart-2" />
        <rect x="26" y="74" width="104" height="9" className="fill-input" />
        <path
          d="M26 88h104"
          strokeWidth="12"
          strokeDasharray="1.5 3"
          className="stroke-background"
        />
        <rect x="26" y="112" width="70" height="8" className="fill-primary-press" />
      </svg>
      <svg x="310" y="0" width="150" height="150">
        <rect width="150" height="150" className="fill-primary-deep" />
        <path d="M75 20l50 28v58l-50 28-50-28V48z" className="fill-primary" />
        <path d="M75 20l50 28-50 28-50-28z" className="fill-chart-2" />
        <path d="M75 76l50-28v58l-50 28z" className="fill-primary-press" />
        {[14, 26, 38].map((r) => (
          <circle key={r} cx="105" cy="100" r={r} fill="none" strokeWidth="2" className="stroke-tag/60" />
        ))}
      </svg>

      {/* Row 2 */}
      <rect y="150" width="460" height="215" className="fill-primary-press" />
      <path d="M30 230l26-40 26 40zM30 270l26-40 26 40z" className="fill-chart-2" />
      <rect x="30" y="300" width="70" height="3" className="fill-tag/60" />
      <rect x="30" y="312" width="130" height="3" className="fill-tag/60" />
      <rect x="30" y="324" width="100" height="3" className="fill-tag/60" />
      <g className="fill-chart-2">
        <path d="M200 205c-22 0-22-30 0-45 22 15 22 45 0 45z" />
        <path d="M200 240c-22 0-22-30 0-45 22 15 22 45 0 45z" />
      </g>
      <path
        d="M200 262c2 14 6 18 18 20-12 2-16 6-18 20-2-14-6-18-18-20 12-2 16-6 18-20z"
        className="fill-background"
      />
      <path d="M262 220h8v8h-8zM262 236h8v8h-8zM274 228h8v8h-8z" className="fill-chart-2" />
      <path
        d="M290 228a100 100 0 0 1 170-12v90a120 120 0 0 1-170-78z"
        className="fill-primary"
      />
      <path d="M335 262h125M345 278h115M360 294h100" strokeWidth="6" className="stroke-chart-2" />
      <path
        d="M120 322l-22 8 2-24-18-16 24-4 12-20 12 20 24 4-18 16 2 24z"
        className="fill-chart-5"
        transform="translate(60 -90) scale(1.25)"
      />
      <g transform="translate(30 0)">
        <rect x="0" y="262" width="90" height="100" className="fill-input" transform="translate(0 -62)" />
        <path d="M0 200l90 100H0z" className="fill-foreground/20" transform="translate(0 0)" />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={246 + i * 20} cy="320" r="6" className="fill-chart-2" />
      ))}

      {/* Row 3 */}
      <rect y="365" width="460" height="275" className="fill-primary" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M0 ${392 + i * 12}h300`} strokeWidth="1.5" className="stroke-tag/70" />
      ))}
      <rect y="470" width="235" height="170" className="fill-foreground" />
      <path d="M0 640v-60a60 60 0 0 1 120 0v60z" className="fill-chart-2" />
      {[10, 22, 34].map((i) => (
        <path key={i} d={`M0 640v-${60 + i}a${60 + i} ${60 + i} 0 0 1 ${120 + 2 * i} 0`} fill="none" strokeWidth="1.5" className="stroke-tag/50" transform={`translate(${-i} 0)`} />
      ))}
      <rect x="255" y="480" width="22" height="46" className="fill-primary-press" />
      <circle cx="266" cy="545" r="10" fill="none" strokeWidth="2" className="stroke-tag" />
      <path
        d="M260 640c14-14 20 14 34 0s20 14 34 0 20 14 34 0M260 624c14-14 20 14 34 0s20 14 34 0 20 14 34 0"
        fill="none"
        strokeWidth="2"
        className="stroke-chart-2"
      />
      <path d="M225 520a125 125 0 0 1 250 0z" className="fill-foreground" />
      <path d="M225 520h125v125a125 125 0 0 1-125-125z" className="fill-primary-deep" />
      <path d="M350 520h125a125 125 0 0 1-125 125z" className="fill-input" />
      <circle cx="350" cy="520" r="7" className="fill-background" />
      <circle cx="350" cy="520" r="3" className="fill-foreground" />
      <g className="fill-background">
        {Array.from({ length: 30 }, (_, n) => (
          <circle key={n} cx={410 + (n % 5) * 10} cy={575 + Math.floor(n / 5) * 10} r="1.8" />
        ))}
      </g>
    </svg>
  );
}
