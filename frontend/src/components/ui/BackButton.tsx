import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface BackButtonProps {
  /** Renders as a <Link> when given a route; pass `onClick` instead for an imperative navigate(). */
  to?: string;
  onClick?: () => void;
  label: ReactNode;
  className?: string;
}

const classes =
  "group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-slate-200 bg-white py-1.5 ps-1.5 pe-3.5 text-sm font-medium text-slate-600 transition-all duration-200 hover:border-sky-200 hover:bg-sky-50/60 hover:text-sky-700 hover:shadow-[0_6px_16px_-8px_rgba(56,189,248,0.35)]";

/**
 * The one "go back to the previous/parent page" control in the app - an icon-tile + label pill
 * with the same hover glow-bloom as StatCard/BranchSwitcher, plus a small directional nudge on
 * the arrow itself so it reads as "slide back" rather than a static icon. RTL-aware: the arrow
 * mirrors and the hover nudge reverses direction instead of just flipping in place.
 */
export function BackButton({ to, onClick, label, className = "" }: BackButtonProps) {
  const content = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -start-3 -top-4 h-12 w-12 rounded-full bg-sky-300 opacity-0 blur-lg transition-all duration-500 ease-out group-hover:scale-125 group-hover:opacity-30"
      />
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all duration-200 group-hover:-translate-x-0.5 group-hover:bg-sky-100 group-hover:text-sky-600 rtl:group-hover:translate-x-0.5">
        <ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="relative">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`${classes} ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`${classes} ${className}`}>
      {content}
    </button>
  );
}
