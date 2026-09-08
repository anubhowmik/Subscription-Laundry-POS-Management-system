import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";
import logo from "../../assets/logo-color.svg";

const NAV_LINKS = [
  { key: "apps", hrefKey: "/#apps" },
  { key: "industries", hrefKey: "/#industries" },
  { key: "pricing", hrefKey: "/#pricing" },
  { key: "help", hrefKey: "" },
] as const;

// A centered underline that grows outward from the middle on hover (not a plain color swap, and
// not the mockup's left-to-right sweep) - reads as a more deliberate interaction, distinct from
// every plain text link elsewhere in the app.
const NAV_LINK_CLASSES =
  "relative text-sm font-medium text-slate-600 transition-colors duration-200 hover:text-sky-600 after:absolute after:-bottom-1 after:start-1/2 after:h-0.5 after:w-0 after:-translate-x-1/2 after:rounded-full after:bg-sky-600 after:transition-all after:duration-300 hover:after:w-full";

/**
 * The public site header - shared by the Home launcher and every public auth screen (Login,
 * Register, Verify Email), so "Saudi Laundry" reads as one product with one consistent shell
 * everywhere you can reach it logged out. Also rendered inside AppLayout (every authenticated
 * page) - which is why the marketing nav links below are gated to being ON Home (`pathname ===
 * "/"`), not to logout state: Home's #apps/#industries/#pricing anchors are real and useful
 * whether or not you're signed in (a signed-in user can revisit Home directly), but they'd be a
 * confusing dead end if shown from inside e.g. Sales, which is why it's the ROUTE that gates them,
 * not `user`.
 *
 * Translucent + blurred + bottom-border, matching the user's own reference mockup's nav bar
 * exactly (2026-09-08) - `sticky top-0` keeps it pinned through a scroll on Home; a harmless no-op
 * inside AppLayout, which never scrolls this element (only the inner <main> scrolls there).
 */
export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90">
          <img src={logo} alt="" className="h-9 w-9 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight text-slate-900">{t("app.name")}</div>
            {/* Dropped below sm - the main width pressure on a phone-width header competing
                against the Sign In/Start Free Trial buttons, and purely decorative. */}
            <div className="hidden truncate text-xs leading-tight text-slate-400 sm:block">{t("app.tagline")}</div>
          </div>
        </Link>

        {/* Marketing nav - only meaningful on Home itself, where every href below is a real
            on-page anchor (see HomePage.tsx's #apps/#industries/#pricing sections) or a real
            mailto, never a fabricated destination. Gated to the ROUTE, not login state - a
            signed-in user revisiting Home still finds these links live and useful; it's only a
            dead end from inside an actual app page (Sales, Dashboard, ...), which is exactly
            where Header is rendered but this nav shouldn't be. Each link's animated underline
            (grows from the center out on hover, matching the reference mockup) reads as a
            deliberate site-nav interaction rather than a plain color swap. */}
        {isHome && (
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map(({ key, hrefKey }) =>
              key === "help" ? (
                <a key={key} href="mailto:hello@saudilaundry.example.com" className={NAV_LINK_CLASSES}>
                  {t(`nav.${key}`)}
                </a>
              ) : (
                <Link key={key} to={hrefKey} className={NAV_LINK_CLASSES}>
                  {t(`nav.${key}`)}
                </Link>
              ),
            )}
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <Button variant="outline" size="sm" onClick={() => logout()}>
              {t("nav.logout")}
            </Button>
          ) : (
            <>
              <Link to="/login">
                <Button variant="outline" size="sm">
                  {t("home.signIn")}
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">{t("home.startTrial")}</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
