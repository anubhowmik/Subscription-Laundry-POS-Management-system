/**
 * Small rotating accent palette for mockup-style card tiles (2026-09-08 design overhaul). Every
 * card grid - the Home launcher's app cards and each app's own new module-grid landing page -
 * cycles through these by card position, so a grid reads as several distinct modules rather than
 * one flat color. Deliberately separate from the app's own solid Nordic Indigo brand color (see
 * index.css's rebrand note), which stays on buttons/links/active-nav regardless of this palette.
 */
export const CARD_ACCENT_PALETTE = ["#263BAA", "#14B8A6", "#38BDF8", "#F59E0B", "#7C6FE0"] as const;

export function pickAccent(index: number): string {
  return CARD_ACCENT_PALETTE[index % CARD_ACCENT_PALETTE.length];
}
