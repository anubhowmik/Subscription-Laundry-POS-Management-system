import type { ReactNode } from "react";

/**
 * One labeled group of module cards on an app's landing grid - mirrors the Sidebar's own section
 * labels (Sales & Orders, Finance, ...) so a 20+-item app reads as a few organized groups rather
 * than one flat wall of cards.
 */
export function CardGridSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
