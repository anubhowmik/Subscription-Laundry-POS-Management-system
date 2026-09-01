import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// Same lilac-tinted accent as Card - a data panel is still a "card" in this design system, so it
// gets the same top-edge color cap + glow shadow tying it back to the hand-drawn headline above it.
export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-t-4 border-slate-200 border-t-sky-300 bg-white shadow-[0_14px_32px_-18px_rgba(150,120,196,0.4)]",
        className,
      )}
      {...props}
    />
  );
}

/** Search/filters strip that lives INSIDE the same panel as the table it controls (a border
 * separates it, not a gap) - so a list page reads as one data panel with a toolbar, not a
 * floating search input sitting above an unrelated-looking table box. Put this as TableContainer's
 * first child, then wrap the table itself in a scrolling div (see TableScroll) as the second. */
export function TableToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3", className)} {...props} />;
}

/** Horizontal scroll boundary for the table itself, separate from TableContainer's own
 * overflow-hidden (which exists to keep TableToolbar's rounded corners clean instead). */
export function TableScroll({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-x-auto", className)} {...props} />;
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-slate-200 bg-slate-50", className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-slate-500", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-100", className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-slate-700", className)} {...props} />;
}
