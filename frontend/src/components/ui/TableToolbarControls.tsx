import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, FileText, Printer, Columns3, Check, ChevronDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { selectClass } from "./formClasses";
import { exportToExcel, exportToPdf, printTable, type ExportColumn, type ExportRow } from "../../lib/tableExport";

/** Matches the reference's "Show [N]" per-page entries dropdown. */
export function PageSizeSelect({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn(selectClass, "w-auto", className)}>
      {[10, 25, 50, 100].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/** A single "Export" button opening a small dropdown (Excel / PDF / Print) - replaces the earlier
 * three-separate-buttons layout to cut toolbar clutter. `getRows` is called on demand when an
 * option is picked and must resolve to EVERY row matching the table's current filters/sort, not
 * just the currently-loaded page - see `fetchAllRows` in `lib/tableExport.ts` for the paginated-
 * endpoint helper most callers use to build it. Shows a brief loading state while that fetch runs,
 * since exporting "all matching rows" now does real network work instead of using data already in
 * memory. */
export function TableExportButtons({
  title,
  columns,
  getRows,
  isAr,
}: {
  title: string;
  columns: ExportColumn[];
  getRows: () => Promise<ExportRow[]>;
  isAr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const options = [
    { key: "excel", label: isAr ? "إكسل (.xlsx)" : "Excel (.xlsx)", icon: FileSpreadsheet, exportFn: exportToExcel },
    { key: "pdf", label: "PDF (.pdf)", icon: FileText, exportFn: exportToPdf },
    { key: "print", label: isAr ? "طباعة" : "Print", icon: Printer, exportFn: printTable },
  ];

  async function handlePick(exportFn: (title: string, columns: ExportColumn[], rows: ExportRow[]) => void | Promise<void>) {
    setLoading(true);
    try {
      const rows = await getRows();
      await exportFn(title, columns, rows);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {isAr ? "تصدير" : "Export"} <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute end-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={loading}
              onClick={() => handlePick(opt.exportFn)}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <opt.icon className="h-3.5 w-3.5 text-slate-400" /> {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small checkbox square used throughout this menu - real checkbox affordance (not just a
 * checkmark-on-hover) so it reads unambiguously as "toggle this on/off" at a glance. */
function MiniCheckbox({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
        checked || indeterminate ? "border-sky-600 bg-sky-600" : "border-slate-300 bg-white",
      )}
    >
      {checked && <Check className="h-2.5 w-2.5 text-white" />}
      {indeterminate && !checked && <span className="h-0.5 w-2 rounded-full bg-white" />}
    </span>
  );
}

/** Matches the reference's "Column visibility" DataTable button - a popover checklist toggling
 * which columns show, backed by useColumnVisibility.ts's persisted hidden-set. A "Select All" row
 * at the top (checked/indeterminate/unchecked, matching every standard multi-select checklist)
 * toggles every column at once - added because with a dozen-plus columns on some pages, clicking
 * each one individually to reset back to "show everything" was tedious. */
export function ColumnVisibilityMenu({
  columns,
  isVisible,
  onToggle,
  isAr,
}: {
  columns: { key: string; label: string }[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  isAr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const visibleCount = columns.filter((c) => isVisible(c.key)).length;
  const allVisible = visibleCount === columns.length;
  const noneVisible = visibleCount === 0;

  function toggleAll() {
    for (const c of columns) {
      if (allVisible) {
        if (isVisible(c.key)) onToggle(c.key);
      } else {
        if (!isVisible(c.key)) onToggle(c.key);
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
      >
        <Columns3 className="h-3.5 w-3.5" /> {isAr ? "الأعمدة" : "Columns"}
      </button>
      {open && (
        <div className="absolute end-0 z-20 mt-1 max-h-80 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={toggleAll}
            className="flex w-full items-center gap-2 border-b border-slate-100 px-2.5 py-2 text-start text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <MiniCheckbox checked={allVisible} indeterminate={!allVisible && !noneVisible} />
            {isAr ? "تحديد الكل" : "Select All"}
          </button>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {columns.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onToggle(c.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs text-slate-700 hover:bg-slate-50"
              >
                <MiniCheckbox checked={isVisible(c.key)} />
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A single "Filters" button opening a popover panel for a list page's secondary filters
 * (checkboxes, dropdowns) - keeps the toolbar's main row uncluttered (search + this button +
 * Show/Columns/Export) instead of every filter control sitting inline and wrapping across lines
 * once a page has more than two or three of them. `activeCount` renders as a small badge so a
 * viewer can tell at a glance whether any filter is applied without opening the panel; pass a
 * "Clear all" `onClear` when there's at least one to reset in one click. Content is caller-owned
 * (`children`) so each page's own specific filters render inside - this component only owns the
 * button/popover chrome. */
const FILTERS_POPOVER_WIDTH = 320; // matches the popover's w-80

export function FiltersMenu({
  activeCount,
  onClear,
  isAr,
  children,
}: {
  activeCount: number;
  onClear?: () => void;
  isAr: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Rendered via a portal (below) rather than absolutely positioned inside the toolbar - this
  // panel is tall enough (several filters) to exceed TableContainer's height on a page with few
  // rows, and TableContainer uses overflow-hidden for its rounded corners, which would silently
  // clip the bottom of the panel with no way to scroll to the rest. A portal escapes that.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = isAr ? Math.max(8, rect.right - FILTERS_POPOVER_WIDTH) : rect.left;
    setCoords({ top: rect.bottom + 4, left });
  }, [open, isAr]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize(e: Event) {
      // Scrolling the panel's own (overflow-y-auto) body must not close it.
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium",
          activeCount > 0 ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" /> {isAr ? "الفلاتر" : "Filters"}
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: coords.top, left: coords.left, width: FILTERS_POPOVER_WIDTH }}
            className="fixed z-50 flex max-h-[min(28rem,80vh)] max-w-[90vw] flex-col rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-semibold text-slate-700">{isAr ? "الفلاتر" : "Filters"}</span>
              {activeCount > 0 && onClear && (
                <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600">
                  <X className="h-3 w-3" /> {isAr ? "مسح الكل" : "Clear all"}
                </button>
              )}
            </div>
            <div className="space-y-3 overflow-y-auto p-3">{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
