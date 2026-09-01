import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "success" | "danger" | "warning" | "info";

const variants: Record<Variant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Alert({ className, variant = "info", ...props }: AlertProps) {
  return (
    <div
      role={variant === "danger" ? "alert" : undefined}
      className={cn("rounded-lg border px-3.5 py-2.5 text-sm", variants[variant], className)}
      {...props}
    />
  );
}
