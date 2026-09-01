import type { ReactNode } from "react";
import { Squiggle } from "./Squiggle";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/**
 * Same hand-drawn treatment as Home/Auth/Billing's headings (Caveat + Squiggle for the title,
 * Kalam for the subtitle) - the one shared component every list/detail page renders its title
 * through, so this single edit carries the font across all three apps' pages at once.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="relative inline-block pb-1">
          <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
            {title}
          </span>
          <Squiggle className="text-sky-300" />
        </h1>
        {subtitle && (
          <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-2 text-base text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
