import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Phone, MapPin, Languages, ShoppingCart, ShieldCheck, Users } from "lucide-react";
import logo from "../../assets/logo-color.svg";

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

/** WaveDivider's curve, as an open path so it can also be stroked. */
const CURVE = "M0,54 C240,10 480,0 720,18 C960,36 1200,46 1440,20";
export const CURVE_HEIGHT = 54;

const PRODUCTS = [
  { key: "home.apps.pos.name", Icon: ShoppingCart },
  { key: "home.apps.usersRules.name", Icon: Users },
  { key: "home.apps.zatca.name", Icon: ShieldCheck },
] as const;

/**
 * Standard three-column footer in the app's own look - white surface, slate borders, Nordic Indigo
 * (sky-*) accents and Vanilla Mist icon tiles, the Kalam script face for the tagline - instead of
 * the old near-black marketing footer. Its top edge is the Home page's WaveDivider curve, traced by
 * an indigo line; the curve rises CURVE_HEIGHT px above the footer, so whatever sits above it
 * needs that much free space (AppLayout adds a spacer). AppLayout puts it at the end of the page at full width
 * (under the sidebar too); Home / auth / billing close their pages with it.
 */
export function Footer() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const year = new Date().getFullYear();
  const gradientId = useId();

  return (
    <footer className="relative bg-white">
      {/* Curved top edge (same curve as WaveDivider), outlined with the brand gradient. */}
      <svg
        aria-hidden
        viewBox="0 0 1440 54"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 block w-full"
        style={{ top: -CURVE_HEIGHT + 1, height: CURVE_HEIGHT }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--color-sky-600)" />
            <stop offset="55%" stopColor="var(--color-sky-400)" />
            <stop offset="100%" stopColor="var(--color-sky-200)" />
          </linearGradient>
        </defs>
        <path d={`${CURVE} L1440,54 L0,54 Z`} fill="white" />
        <path d={CURVE} fill="none" stroke={`url(#${gradientId})`} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mx-auto max-w-6xl px-6 pb-6 pt-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 ring-1 ring-sky-200">
                <img src={logo} alt="" className="h-6 w-6 shrink-0" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">{t("app.name")}</div>
                <div className="text-xs text-slate-500">{t("app.tagline")}</div>
              </div>
            </div>
            <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">
              {t("home.tagline")}
            </p>
            <div className="mt-4 flex items-center gap-2">
              {SOCIAL_LINKS.map(({ key, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t(`footer.social.${key}`)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 hover:shadow-[0_6px_14px_-6px_rgba(38,59,170,0.45)]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">{t("footer.product")}</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
              {PRODUCTS.map(({ key, Icon }) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">{t("footer.contact")}</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
              <li className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
                <a href={`mailto:${COMPANY.email}`} className="truncate transition-colors hover:text-sky-700">
                  {COMPANY.email}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
                <span className="ltr-nums">{COMPANY.phone}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                </span>
                {isAr ? COMPANY.addressAr : COMPANY.addressEn}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-5 text-xs text-slate-500 sm:flex-row">
          <span>
            © <span className="ltr-nums">{year}</span> {isAr ? COMPANY.nameAr : COMPANY.nameEn}. {t("footer.rightsReserved")}
          </span>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(isAr ? "en" : "ar")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
          >
            <Languages className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
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
