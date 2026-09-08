import type { ReactNode } from "react";
import { Header } from "../layout/Header";
import { Footer } from "../layout/Footer";

/**
 * Shared chrome for every unauthenticated auth screen (login, register, verify-email) - the same
 * Header/Footer the Home launcher uses, not a separately-designed shell. A visitor should feel
 * like they're still inside "Saudi Laundry" while signing in, not dropped into a different product.
 */
export function AuthLayout({ children, cardClassName = "max-w-sm" }: { children: ReactNode; cardClassName?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      {/* No vertical centering here - Home's own <main> just flows from the top with padding, so
          this does the same. Centering the card in 100% of the remaining viewport height made the
          gap before the footer balloon or shrink with screen height instead of following the
          card - the footer's position should be a function of the content above it, not the
          viewport. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 justify-center px-4 pb-24 pt-16 sm:pb-32 sm:pt-20">
        <div
          className={`h-fit w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(38,59,170,0.45)] ${cardClassName}`}
        >
          {/* The same Nordic Indigo signature accent the script-font headline uses (see Squiggle),
              carried onto the card itself so the form doesn't read as a generic white box bolted
              onto a hand-drawn page. */}
          <div className="h-1.5 bg-sky-300" aria-hidden />
          <div className="p-8">{children}</div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
