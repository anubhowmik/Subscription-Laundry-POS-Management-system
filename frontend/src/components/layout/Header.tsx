import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";

/**
 * The public site header - shared by the Home launcher and every public auth screen (Login,
 * Register, Verify Email), so "Saudi Laundry" reads as one product with one consistent shell
 * everywhere you can reach it logged out, not a marketing page bolted onto a separately-designed
 * auth flow. Mirrors Footer.tsx's role: one real component, not a near-duplicate per page.
 */
export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-xl">🧼</div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">{t("app.name")}</div>
            <div className="text-xs leading-tight text-slate-400">{t("app.tagline")}</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
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
      {/* Signature detail: one thin band, one color per application - a literal reading of "three
          applications, one platform" that also previews each app's identity before you open it. */}
      <div className="flex h-[3px]" aria-hidden>
        <div className="flex-1 bg-app-pos-500" />
        <div className="flex-1 bg-app-users-500" />
        <div className="flex-1 bg-app-zatca-500" />
      </div>
    </header>
  );
}
