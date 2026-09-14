import type { ButtonHTMLAttributes, HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "../../lib/cn";

// Same Nordic-Indigo-tinted accent as Card - a data panel is still a "card" in this design
// system, so it gets the same top-edge color cap + glow shadow tying it back to the hand-drawn
// headline above it.
export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-t-4 border-slate-200 border-t-sky-300 bg-white shadow-[0_14px_32px_-18px_rgba(38,59,170,0.4)]",
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

/** A clickable `<Th>` that reports its own sort state - matches the reference's DataTable
 * sortable column headers (click to sort, arrow icon shows direction). Purely presentational:
 * the caller owns `sortBy`/`sortOrder` state and passes it to the list query's params. */
export function SortableTh({
  field,
  sortBy,
  sortOrder,
  onSort,
  className,
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & {
  field: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const active = sortBy === field;
  const Icon = active ? (sortOrder === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <Th className={className} {...props}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn("inline-flex items-center gap-1 hover:text-slate-700", active && "text-slate-700")}
      >
        {children}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </Th>
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-100", className)} {...props} />;
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-slate-700", className)} {...props} />;
}

type RowActionVariant = "default" | "success" | "danger" | "warning";

const rowActionVariants: Record<RowActionVariant, string> = {
  default: "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200",
  danger: "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200",
  warning: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200",
};

const rowActionBaseClass = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-50";

/** A single compact, icon-only row action (Edit/Pay/Deactivate/...) - the small, tooltip-labeled
 * replacement for what used to be a full-text `<Button size="sm">` per action. Several of these
 * side by side inside `RowActions` take a fraction of the width a text-button row did, which is
 * what actually fixes the "Actions column forces horizontal scroll" problem full-width stacked
 * text buttons only partially solved (see CustomerGroupsPage's Round 21 for that first pass) -
 * compact enough to need neither stacking nor scrolling on any page in this app so far. `label` is
 * both the accessible name and the native-tooltip text, so every action stays as discoverable as
 * a labeled button was, just not permanently visible as text. */
export function RowActionButton({
  icon: Icon,
  label,
  variant = "default",
  className,
  ...props
}: { icon: LucideIcon; label: string; variant?: RowActionVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(rowActionBaseClass, rowActionVariants[variant], className)}
      {...props}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </button>
  );
}

/** Same look as `RowActionButton` but an actual `<Link>` - for a row action that navigates (e.g.
 * Sales' "Invoice" link opening `/invoices/:id` in a new tab) instead of running a handler. */
export function RowActionLink({
  icon: Icon,
  label,
  variant = "default",
  className,
  ...props
}: { icon: LucideIcon; label: string; variant?: RowActionVariant } & LinkProps) {
  return (
    <Link title={label} aria-label={label} className={cn(rowActionBaseClass, rowActionVariants[variant], className)} {...props}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </Link>
  );
}

/** Wraps a row's `RowActionButton`s in one compact horizontal cluster - pass `align="start"` for
 * an actions column placed first (e.g. Suppliers), the default `"end"` for one placed last (every
 * other page). Never stacks or wraps - compact icon buttons are why it no longer needs to. */
export function RowActions({ align = "end", className, ...props }: HTMLAttributes<HTMLDivElement> & { align?: "start" | "end" }) {
  return <div className={cn("flex items-center gap-1", align === "end" && "justify-end", className)} {...props} />;
}
