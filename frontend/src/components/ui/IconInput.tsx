import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { inputClass, selectClass } from "./formClasses";

/** A text input with a leading icon, matching the EJADA reference's `input-group-addon` fields
 * (Contact ID, Mobile, Email, ...) - same leading-icon mechanics as SearchInput.tsx, generalized
 * to take any lucide icon so form fields can carry the reference's icon choice field-by-field. */
export function IconInput({ icon: Icon, className, ...props }: { icon: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
      <input className={cn(inputClass, "ps-9", className)} {...props} />
    </div>
  );
}

/** Same leading-icon treatment as IconInput, for a `<select>` - e.g. Customer Group/Selling
 * Price Group, which the reference shows with an icon addon exactly like its text fields. */
export function IconSelect({ icon: Icon, className, children, ...props }: { icon: LucideIcon } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
      <select className={cn(selectClass, "ps-9", className)} {...props}>
        {children}
      </select>
    </div>
  );
}
