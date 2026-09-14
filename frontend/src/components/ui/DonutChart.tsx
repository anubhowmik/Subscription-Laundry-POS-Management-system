/**
 * The "circle report" - a hand-rolled SVG donut (stroke-dasharray technique, no charting library),
 * matching the reference dashboard's Payment Method breakdown. Center label shows the total;
 * legend (label + amount) is rendered separately by the caller so it can lay out beside or below.
 */
export function DonutChart({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1F5F9" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const fraction = s.value / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return circle;
          })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && <span className="ltr-nums text-base font-bold text-slate-800">{centerValue}</span>}
          {centerLabel && <span className="text-[11px] text-slate-400">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
