import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

/** A labeled, icon-tagged group of form fields - same card language as Card.tsx (top accent +
 * soft glow) so a long data-entry form reads as a set of clear steps instead of one undifferentiated
 * wall of inputs. Optionally collapsible for secondary/rarely-needed fields (e.g. the reference's
 * own "More Information"/"Add Contact Persons" collapsible sections) so the form doesn't overwhelm
 * with 40+ visible fields at once. */
export function FormSection({
  title,
  description,
  icon: Icon,
  collapsible,
  defaultOpen = true,
  badge,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon: LucideIcon;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <div className="overflow-hidden rounded-xl border border-t-4 border-slate-200 border-t-sky-300 bg-white shadow-[0_10px_24px_-16px_rgba(38,59,170,0.35)]">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          collapsible ? "cursor-pointer select-none hover:bg-slate-50" : "border-b border-slate-100",
        )}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        role={collapsible ? "button" : undefined}
        aria-expanded={collapsible ? isOpen : undefined}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
        </div>
        {actions && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {actions}
          </div>
        )}
        {collapsible && (
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} aria-hidden />
        )}
      </div>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  );
}

/** Small red asterisk for a required field's label - matches the reference's own ":*" convention. */
export function RequiredMark() {
  return <span className="text-red-500"> *</span>;
}
