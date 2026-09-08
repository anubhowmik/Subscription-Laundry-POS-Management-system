/**
 * Realistic, multi-part illustrations for the 5 top-level apps (2026-09-08) - replacing the
 * single-stroke Lucide glyphs (WashingMachine/ShoppingCart/ShoppingBasket/KeyRound/FileCheck2)
 * that were previously used on Home's launcher cards. Each one draws an actual recognizable
 * object (a washing machine with a porthole, a garment on a hanger, a shopping bag, a shield with
 * a key, an invoice with a QR code and a compliance badge) rather than an abstract single-color
 * icon, and each animates ONE specific, meaningful part of itself when its card is hovered - the
 * drum spins, the hanger swings, an item pops out of the bag, the key turns, the compliance badge
 * scales in - instead of the whole icon just rotating/scaling as a block (that's ModuleCard's
 * existing tile-level hover effect, layered underneath this).
 *
 * Every animation is `group-hover:` scoped (ModuleCard's root already carries the `group` class),
 * so nothing moves until the card itself is actually hovered - no idle/looping motion competing
 * for attention on a static page. `color` is the same per-card accent hex ModuleCard already
 * receives (see lib/cardPalette.ts) - shapes are filled/stroked directly with it (plus opacity
 * variants for depth) rather than relying on `currentColor`, since these are small flat
 * illustrations, not single-tone line icons.
 */

interface AppIconProps {
  className?: string;
  color?: string;
}

const DEFAULT_COLOR = "#263BAA";

export function PosLaundryIcon({ className, color = DEFAULT_COLOR }: AppIconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <rect x="6" y="5" width="36" height="38" rx="6" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2" />
      <circle cx="13" cy="11" r="1.6" fill={color} />
      <circle cx="19" cy="11" r="1.6" fill={color} fillOpacity="0.45" />
      <circle cx="24" cy="27" r="12" fill="#fff" stroke={color} strokeWidth="2.5" />
      {/* The spinning drum - only this group rotates, around the porthole's own center. */}
      <g className="origin-[24px_27px] transition-transform group-hover:animate-[spin_1.8s_linear_infinite] motion-reduce:group-hover:animate-none">
        <circle cx="24" cy="27" r="7.5" fill={color} fillOpacity="0.14" />
        <path
          d="M18.5 23.5c1.2 3.4 1.2 7.6 0 11M24 21.5c1.2 3.8 1.2 9.2 0 13M29.5 23.5c-1.2 3.4-1.2 7.6 0 11"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function ServicePosIcon({ className, color = DEFAULT_COLOR }: AppIconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path d="M24 5.5c-1.9 0-3.4 1.4-3.4 3.4" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      {/* Hanger + garment - swings gently from the hook while hovered. */}
      <g className="origin-[24px_9px] transition-transform group-hover:animate-[icon-swing_1.3s_ease-in-out_infinite] motion-reduce:group-hover:animate-none">
        <path d="M24 9 8.5 21h31L24 9z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
        <path
          d="M14 21v16.5a2.5 2.5 0 0 0 2.5 2.5h15a2.5 2.5 0 0 0 2.5-2.5V21"
          fill={color}
          fillOpacity="0.14"
          stroke={color}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path d="M20 21.5 24 26l4-4.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function ProductPosIcon({ className, color = DEFAULT_COLOR }: AppIconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path d="M17.5 14.5v-3a6.5 6.5 0 0 1 13 0v3" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M12.5 14.5h23l-2.1 22.6a3 3 0 0 1-3 2.7H17.6a3 3 0 0 1-3-2.7l-2.1-22.6z"
        fill={color}
        fillOpacity="0.14"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* One item hops up out of the bag on hover. */}
      <g className="origin-[24px_26px] transition-transform duration-300 group-hover:-translate-y-1.5">
        <rect x="20.5" y="22.5" width="7" height="7" rx="1.5" fill={color} />
        <rect x="20.5" y="22.5" width="7" height="2.2" rx="1" fill="#fff" fillOpacity="0.55" />
      </g>
    </svg>
  );
}

export function UsersRulesIcon({ className, color = DEFAULT_COLOR }: AppIconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path
        d="M24 5.5 38 11v10.5c0 10-6 16.7-14 20-8-3.3-14-10-14-20V11l14-5.5z"
        fill={color}
        fillOpacity="0.14"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* The key turns in place, like unlocking, while hovered. */}
      <g className="origin-[23px_23px] transition-transform duration-500 ease-out group-hover:rotate-[35deg]">
        <circle cx="19.5" cy="20.5" r="4" fill="#fff" stroke={color} strokeWidth="2.2" />
        <path d="M22.5 23.5 29 30m0 0 3-3m-3 3 3 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function ZatcaIcon({ className, color = DEFAULT_COLOR }: AppIconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path
        d="M13 5.5h15.5L35 12v29a2.2 2.2 0 0 1-2.2 2.2H13a2.2 2.2 0 0 1-2.2-2.2V7.7A2.2 2.2 0 0 1 13 5.5z"
        fill={color}
        fillOpacity="0.12"
        stroke={color}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <path d="M28.5 5.5V12H35" stroke={color} strokeWidth="2.1" strokeLinejoin="round" />
      {/* A small QR pattern - real ZATCA invoices carry one. */}
      <g fill={color}>
        <rect x="15.5" y="19" width="3.4" height="3.4" />
        <rect x="20.5" y="19" width="3.4" height="3.4" fillOpacity="0.4" />
        <rect x="15.5" y="24" width="3.4" height="3.4" fillOpacity="0.4" />
        <rect x="20.5" y="24" width="3.4" height="3.4" />
      </g>
      <path d="M15.5 32.5h11.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.5" />
      {/* The compliance badge scales in on hover. */}
      <g className="origin-[32px_33px] scale-[0.85] transition-transform duration-300 group-hover:scale-110">
        <circle cx="32" cy="33" r="7.5" fill="#16a34a" />
        <path d="M28.7 33.2 31 35.5l4.6-4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
