import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * The KPI-tile pattern: a solid-color icon square (white glyph) on the start side, label+value+
 * trend stacked to its end side - the whole card tinted to match, not just the icon. One tile per
 * row can be `highlight`ed (solid card fill, white text/icon) to draw the eye to the headline
 * metric, the way a reference dashboard flips one card's colors against its lighter siblings.
 * Only pass `trendPct` when there's a real day-over-day (or similar) comparison behind it - never
 * fabricate a percentage just to fill the slot; the card reads fine without one.
 */
export function StatCard({
  icon: Icon,
  cardBg,
  iconBg,
  iconColor,
  label,
  value,
  trendPct,
  trendLabel,
  warn,
  highlight,
}: {
  icon: LucideIcon;
  /** Literal Tailwind classes, written out at each call site so the static scanner can see them. */
  cardBg: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  trendPct?: number | null;
  trendLabel?: string;
  warn?: boolean;
  highlight?: boolean;
}) {
  const hasTrend = trendPct !== null && trendPct !== undefined;
  return (
    <div
      className={`group relative flex items-center gap-3.5 overflow-hidden rounded-2xl p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${cardBg}`}
    >
      {/* The coloring animation: a blurred clone of the icon's own color blooms in behind it on
          hover - same technique as the Home launcher cards' hover glow, but driven entirely by
          the `iconBg` color already passed in, so every page using this component gets it for
          free instead of needing its own glow color threaded through 28 call sites. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -start-4 -top-6 h-24 w-24 rounded-full opacity-0 blur-2xl transition-all duration-500 ease-out group-hover:scale-125 group-hover:opacity-40 ${iconBg}`}
      />
      <div
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${iconBg}`}
      >
        <Icon className={`h-5.5 w-5.5 ${iconColor}`} strokeWidth={2} aria-hidden />
      </div>
      <div className="relative min-w-0 flex-1">
        <p className={`truncate text-xs font-medium ${highlight ? "text-white/70" : "text-slate-500"}`}>{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span
            className={`ltr-nums text-xl font-bold leading-none ${
              warn ? "text-rose-600" : highlight ? "text-white" : "text-slate-900"
            }`}
          >
            {value}
          </span>
          {hasTrend && (
            <span
              className={`ltr-nums flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                highlight
                  ? "bg-white/20 text-white"
                  : trendPct > 0.5
                    ? "bg-emerald-50 text-emerald-700"
                    : trendPct < -0.5
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-500"
              }`}
            >
              {trendPct > 0.5 ? (
                <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              ) : trendPct < -0.5 ? (
                <TrendingDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              ) : (
                <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              )}
              {Math.abs(trendPct).toFixed(0)}%
            </span>
          )}
        </div>
        {trendLabel && <p className={`mt-0.5 truncate text-[11px] ${highlight ? "text-white/60" : "text-slate-400"}`}>{trendLabel}</p>}
      </div>
    </div>
  );
}
