/**
 * The curved seam odoo.com uses between every section on its marketing page instead of a flat
 * rule. Absolutely positioned over the section's own top edge - the parent must be `relative`
 * (or otherwise establish a positioning context) for it to land in the right place. `fillClassName`
 * sets the curve's fill via `text-*` (it paints with currentColor) to match the section below it.
 */
export function WaveDivider({ fillClassName }: { fillClassName: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 54"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 -top-[53px] block h-[54px] w-full ${fillClassName}`}
    >
      <path d="M0,54 C240,10 480,0 720,18 C960,36 1200,46 1440,20 L1440,54 L0,54 Z" fill="currentColor" />
    </svg>
  );
}
