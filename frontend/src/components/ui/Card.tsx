import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// Same signature every hand-drawn-font surface uses (AuthLayout's card, Billing's plan card): a
// colored cap along the top edge and a Nordic-Indigo-tinted glow instead of a flat gray shadow,
// so a card reads as belonging to the same house style as the Caveat/Squiggle headline above it -
// a plain border-t color (not an inner bar element) so no card loses its ability to clip/overflow
// content.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-t-4 border-slate-200 border-t-sky-300 bg-white shadow-[0_14px_32px_-18px_rgba(38,59,170,0.4)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-100 px-5 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold text-slate-800", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
