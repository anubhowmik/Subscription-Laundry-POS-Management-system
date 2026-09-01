import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const base =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  // sky-600/700/800 all resolve to near-black in the brand palette, so hover/active read via
  // opacity instead of a shade change that would otherwise be invisible.
  primary: "bg-sky-600 text-white shadow-sm hover:opacity-90 active:opacity-80",
  secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300",
  outline: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 active:bg-slate-200",
  ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", fullWidth, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
