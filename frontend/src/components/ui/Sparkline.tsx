/**
 * Tiny inline trend line for a StatCard - the reference dashboard's own mini-squiggle under each
 * KPI tile. Pure SVG, no charting library (matches DashboardPage's existing hand-rolled bar chart
 * convention) - a handful of points doesn't need one.
 */
export function Sparkline({ values, color = "currentColor", height = 28 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const width = 100;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <path d={areaPath} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
