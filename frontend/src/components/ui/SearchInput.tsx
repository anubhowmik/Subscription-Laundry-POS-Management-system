import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "../../lib/cn";

/** A search input with a leading icon - the standard search affordance used in every list-page
 * toolbar (see Table.tsx's TableToolbar), instead of a bare, icon-less text input. */
export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
      <input
        type="text"
        className={cn(
          "w-full rounded-lg border border-slate-300 bg-white py-2 ps-9 pe-3 text-sm text-slate-900 placeholder:text-slate-400",
          "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30",
          className,
        )}
        {...props}
      />
    </div>
  );
}
