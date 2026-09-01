/**
 * The hand-drawn underline beneath a script-font accent word (see HomePage.tsx's hero and
 * "built for" heading) - one signature stroke reused everywhere that treatment appears, so it
 * stays visually identical rather than redrawn slightly differently each time.
 */
export function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 12" preserveAspectRatio="none" className={`absolute -bottom-0.5 start-0 h-2.5 w-full ${className}`}>
      <path d="M2 8 C 40 2, 80 12, 120 6 S 180 2, 198 8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
