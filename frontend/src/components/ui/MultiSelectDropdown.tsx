import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { inputClass } from "./formClasses";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/** A checkbox dropdown for picking several values - the reference's `select2 multiple` fields. */
export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder,
  isAr,
  inline = false,
  searchable = false,
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  isAr: boolean;
  /** Push the list into the flow instead of floating it - for use inside a scrolling popover
   * (e.g. the Filters menu), where an absolute list would be clipped. */
  inline?: boolean;
  /** A search box at the top of the list - for long lists (items, branches, customers). */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(inputClass, "flex min-h-[42px] flex-wrap items-center gap-1 text-start")}
      >
        {selected.length === 0 && <span className="text-slate-400">{placeholder}</span>}
        {selected.map((o) => (
          <span key={o.value} className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-200">
            {o.label}
            <X
              className="h-3 w-3 cursor-pointer hover:text-red-600"
              strokeWidth={2.5}
              aria-label={isAr ? "إزالة" : "Remove"}
              onClick={(e) => {
                e.stopPropagation();
                toggle(o.value);
              }}
            />
          </span>
        ))}
        <ChevronDown className="ms-auto h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className={cn("mt-1 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1", inline ? "max-h-48" : "absolute z-30 max-h-64 shadow-lg")}>
          {searchable && (
            <div className="sticky top-0 border-b border-slate-100 bg-white px-2 pb-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2">
                <Search className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isAr ? "بحث" : "Search"}
                  autoFocus
                  className="w-full bg-transparent py-1.5 text-sm outline-none"
                />
              </div>
            </div>
          )}
          {shown.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">{isAr ? "لا توجد خيارات" : "No options"}</p>}
          {shown.map((o) => {
            const on = value.includes(o.value);
            return (
              <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-slate-50">
                <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300")}>
                  {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
