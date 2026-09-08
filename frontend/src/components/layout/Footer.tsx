import { useTranslation } from "react-i18next";
import { Mail, Phone, MapPin } from "lucide-react";
import { WaveDivider } from "../ui/WaveDivider";
// Reversed (light-on-dark) variant - the footer's background stays near-black regardless of the
// rest of the app's theme (see the bg-[#0d0d0d] note below), and the plain color mark's navy
// arcs would disappear into it per the logo kit's own usage notes.
import logo from "../../assets/logo-reversed.svg";

/**
 * Placeholder company details/social links - swap these for the real ones whenever they're
 * provided. Deliberately isolated here as the single place to edit, rather than scattered
 * through the JSX below.
 */
const COMPANY = {
  nameEn: "Saudi Laundry",
  nameAr: "المغسلة السعودية",
  email: "hello@saudilaundry.example.com",
  phone: "+966 5X XXX XXXX",
  addressEn: "Riyadh, Saudi Arabia",
  addressAr: "الرياض، المملكة العربية السعودية",
};

const SOCIAL_LINKS = [
  { key: "facebook", href: "#", Icon: FacebookIcon },
  { key: "instagram", href: "#", Icon: InstagramIcon },
  { key: "x", href: "#", Icon: XIcon },
  { key: "linkedin", href: "#", Icon: LinkedinIcon },
];

export function Footer() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const year = new Date().getFullYear();

  return (
    // Deliberately NOT bg-sky-600 - the footer keeps its original near-black background from
    // before the Nordic Indigo/Vanilla Mist rebrand (per explicit user request), while every
    // other sky-600 surface in the app (buttons, active nav, etc.) picked up the new brand color.
    <footer className="relative bg-[#0d0d0d] text-white">
      <WaveDivider fillClassName="text-[#0d0d0d]" />
      <div className="mx-auto max-w-5xl px-6 pb-12 pt-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <img src={logo} alt="" className="h-5 w-5 shrink-0" aria-hidden />
              </div>
              <span className="text-base font-semibold text-white">{t("app.name")}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/50">{t("home.tagline")}</p>
            <div className="mt-5 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ key, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t(`footer.social.${key}`)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{t("footer.product")}</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-white/70">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-pos-500" aria-hidden />
                {t("home.apps.pos.name")}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-users-500" aria-hidden />
                {t("home.apps.usersRules.name")}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-app-zatca-500" aria-hidden />
                {t("home.apps.zatca.name")}
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{t("footer.contact")}</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-white/70">
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-white/40" strokeWidth={2} aria-hidden />
                <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
                  {COMPANY.email}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-white/40" strokeWidth={2} aria-hidden />
                <span className="ltr-nums">{COMPANY.phone}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-white/40" strokeWidth={2} aria-hidden />
                <span>{isAr ? COMPANY.addressAr : COMPANY.addressEn}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
          <span>
            © <span className="ltr-nums">{year}</span> {isAr ? COMPANY.nameAr : COMPANY.nameEn}. {t("footer.rightsReserved")}
          </span>
          <button
            onClick={() => i18n.changeLanguage(isAr ? "en" : "ar")}
            className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.14] hover:text-white"
          >
            {isAr ? "English" : "العربية"}
          </button>
        </div>
      </div>
    </footer>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.5 21v-7.8h2.6l.4-3h-3v-1.9c0-.87.24-1.46 1.5-1.46h1.6V4.14C15.9 4.1 15 4 13.94 4 11.7 4 10.2 5.37 10.2 8v2.2H7.6v3h2.6V21h3.3Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M13.9 10.9 20 4h-2l-5 5.9L8.6 4H4l6.3 9.1L4 20h2l5.4-6.3L15.9 20H20l-6.1-9.1Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M6.94 8.5H4.03V20h2.91V8.5ZM5.48 4a1.69 1.69 0 1 0 0 3.38A1.69 1.69 0 0 0 5.48 4ZM20 20h-2.9v-6.02c0-1.44-.03-3.28-2-3.28-2.02 0-2.32 1.57-2.32 3.18V20H9.87V8.5h2.79v1.57h.04c.39-.73 1.34-1.5 2.76-1.5 2.95 0 3.54 1.95 3.54 4.48V20Z" />
    </svg>
  );
}
