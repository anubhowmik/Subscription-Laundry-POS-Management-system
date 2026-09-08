import type { CSSProperties, ElementType } from "react";
import { Link } from "react-router-dom";
import { Reveal } from "../ui/Reveal";

interface ModuleCardProps {
  to: string;
  /** Either a Lucide icon (per-app module grids - see AppLandingPage.tsx) or one of the
   * realistic, hand-drawn multi-part icons in appHome/AppIcons.tsx (Home's launcher cards). Both
   * accept `className` and `color`, which is all this component ever passes - typed loosely
   * (rather than importing LucideIcon's much larger prop type) specifically so it can take
   * either. */
  icon: ElementType<{ className?: string; color?: string }>;
  title: string;
  description?: string;
  /** Hex color for this specific card - see lib/cardPalette.ts. Set as the --c custom property so
   * every tint/border/hover effect below can be derived from one value via color-mix(), instead
   * of needing a literal Tailwind class per color (which Tailwind's static scanner can't see if
   * built from a variable). */
  accentColor: string;
  exploreLabel: string;
  delayMs?: number;
  locked?: boolean;
  lockedHint?: string;
  /** Overrides default <Link> navigation - used by the Home launcher, which needs to record the
   * chosen app (see useCurrentAppStore) before navigating. */
  onClick?: () => void;
  /** Forces this exact pixel box size via inline style, bypassing flex/grid stretch entirely -
   * that's a deliberate choice, not a stylistic preference: a percentage/stretch-based size is
   * one that depends on the parent's layout mode and the item's own content length both landing
   * exactly right, and it's what silently produced a narrower/shorter card for the shortest-text
   * app on Home earlier. An explicit pixel size can't be affected by content length at all. Home's
   * launcher grid always passes this; per-app module grids (AppLandingPage) leave it unset and
   * size via their own CSS Grid columns instead. */
  width?: number;
  height?: number;
}

// `w-full h-full` (not just h-full) - when a caller's wrapper is itself a flex container (e.g.
// HomePage.tsx's fixed-size card slots), a flex item with no explicit width sizes to its own
// CONTENT width by default, not the wrapper's - a short-text card (e.g. "ZATCA KSA") would then
// render visibly narrower than siblings with longer text that get shrunk down to the wrapper's
// width, instead of every card uniformly filling the slot it's given.
const BASE_CLASSES =
  "group relative flex h-full w-full flex-col items-center gap-2.5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-center no-underline shadow-[0_1px_2px_rgba(17,21,54,0.04)] transition-[transform,box-shadow,border-color] duration-300 before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:origin-left before:scale-x-0 before:bg-[linear-gradient(90deg,var(--c),transparent)] before:transition-transform before:duration-300";

const INTERACTIVE_CLASSES =
  "cursor-pointer hover:-translate-y-1.5 hover:[border-color:color-mix(in_srgb,var(--c)_35%,#fff)] hover:[box-shadow:0_20px_40px_-18px_color-mix(in_srgb,var(--c)_45%,transparent)] hover:before:scale-x-100 focus-visible:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:[--tw-ring-color:var(--c)] focus-visible:before:scale-x-100";

const LOCKED_CLASSES = "cursor-not-allowed opacity-60";

export function ModuleCard({ to, icon: Icon, title, description, accentColor, exploreLabel, delayMs = 0, locked = false, lockedHint, onClick, width, height }: ModuleCardProps) {
  const style = {
    ["--c" as string]: accentColor,
    ...(width != null ? { width, flexShrink: 0 } : undefined),
    ...(height != null ? { height, flexShrink: 0 } : undefined),
  } as CSSProperties;

  const inner = (
    <>
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 group-hover:[box-shadow:0_12px_26px_color-mix(in_srgb,var(--c)_28%,transparent)]"
        style={
          locked
            ? undefined
            : { background: `color-mix(in srgb, ${accentColor} 12%, white)`, borderColor: `color-mix(in srgb, ${accentColor} 18%, white)` }
        }
      >
        <Icon className="h-7 w-7" color={locked ? "#94a3b8" : accentColor} />
      </span>
      {/* line-clamp on both title and description (not just relying on the fixed-size box +
          overflow-hidden to silently crop anything too long) - so a longer label never LOOKS
          different from its siblings, it gracefully truncates to the same line count instead. */}
      <span className="line-clamp-2 w-full text-[0.93rem] font-semibold leading-snug text-slate-900 transition-colors duration-300 group-hover:[color:var(--c)]">
        {title}
      </span>
      {description && <p className="line-clamp-2 w-full text-xs leading-relaxed text-slate-500">{description}</p>}
      {locked ? (
        lockedHint && <p className="text-[11px] font-medium text-slate-400">{lockedHint}</p>
      ) : (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[0.72rem] font-semibold opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5" style={{ color: accentColor }}>
          {exploreLabel}
          <ArrowIcon className="h-3 w-3 rtl:rotate-180" />
        </span>
      )}
    </>
  );

  const className = `${BASE_CLASSES} ${locked ? LOCKED_CLASSES : INTERACTIVE_CLASSES}`;

  return (
    <Reveal delayMs={delayMs}>
      {locked ? (
        <div className={className} style={style} aria-disabled>
          {inner}
        </div>
      ) : onClick ? (
        <div
          role="button"
          tabIndex={0}
          className={className}
          style={style}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onClick();
          }}
        >
          {inner}
        </div>
      ) : (
        <Link to={to} className={className} style={style}>
          {inner}
        </Link>
      )}
    </Reveal>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5l7 7-7 7 2 2 9-9-9-9z" />
    </svg>
  );
}
