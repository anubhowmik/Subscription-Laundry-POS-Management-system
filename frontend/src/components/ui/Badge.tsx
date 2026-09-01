import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "neutral" | "success" | "warning" | "danger" | "info";

const variants: Record<Variant, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variants[variant], className)}
      {...props}
    />
  );
}
