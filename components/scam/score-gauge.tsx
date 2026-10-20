"use client";

interface ScoreGaugeProps {
  value: number; // 0-100
  color: string;
  size?: number;
}

/** Animated SVG ring gauge for the Trust Score — soft, Pinterest-style. */
export function ScoreGauge({ value, color, size = 168 }: ScoreGaugeProps) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#ECEAE6"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1), stroke 300ms" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tracking-tight text-neutral-900">{clamped}</span>
        <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
          Trust Score
        </span>
      </div>
    </div>
  );
}
