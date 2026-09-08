import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-triggered entrance, the same mechanism Odoo's website builder uses for its "Animate on
 * Scroll" effect (addons/website/static/src/interactions/animation.js): observe the element,
 * flip a class the first time it enters the viewport, then let CSS play the animation once.
 * Unlike Odoo's version this never re-hides on scroll-out - a launcher page should stay settled,
 * not replay every time you scroll past it.
 */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
  as: As = "div",
  id,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: "div" | "section";
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <As
      ref={ref as never}
      id={id}
      style={visible ? { animationDelay: `${delayMs}ms` } : undefined}
      className={`${visible ? "animate-fade-slide-up" : "opacity-0"} ${className}`}
    >
      {children}
    </As>
  );
}
