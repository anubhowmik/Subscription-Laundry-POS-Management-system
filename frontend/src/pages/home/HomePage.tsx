import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { WashingMachine, KeyRound, FileCheck2, type LucideIcon } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Reveal } from "../../components/ui/Reveal";
import { WaveDivider } from "../../components/ui/WaveDivider";
import { Squiggle } from "../../components/ui/Squiggle";
import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";

// Each application has its own identity color (see index.css's --color-app-* tokens) - Odoo-style,
// so the launcher reads as three distinct departments rather than three identical tiles. Classes
// are written out literally (not built from a template string) so Tailwind's static scanner can
// see and generate them - the same color is then carried into that app's own Sidebar/Topbar once
// you're inside it, see Sidebar.tsx's APPS array using the same key.
// The launcher cards are styled as claim-ticket stubs - the one physical artifact every laundry
// customer already recognizes (the perforated ticket you get for your order). All three cards
// share the exact same ticket template (stub + dashed perforation + body); only the stub's tint,
// icon and copy change per app, so the set reads as "one format, three departments" rather than
// three unrelated card designs.
interface AppDef {
  key: string;
  /** Same lucide icon this app uses in its own Sidebar (see Sidebar.tsx's APPS array) - one
   * consistent mark per app instead of the launcher inventing a second, different-looking logo. */
  icon: LucideIcon;
  to: string;
  permission: string;
  /** Every class is written literally per-app (never built from a template string) so
   * Tailwind's static scanner can see and generate it. */
  cardClasses: string;
  stubClasses: string;
  iconColorClass: string;
  titleHoverClasses: string;
}

interface SegmentDef {
  key: string;
  icon: string;
}

const SEGMENTS: SegmentDef[] = [
  { key: "dryCleaners", icon: "🧥" },
  { key: "laundromats", icon: "🧺" },
  { key: "hotelLaundry", icon: "🏨" },
  { key: "industrialLaundry", icon: "🏭" },
  { key: "linenRental", icon: "👔" },
  { key: "homeDelivery", icon: "🚚" },
  { key: "multiBranch", icon: "🏬" },
  { key: "corporateContracts", icon: "📋" },
];

const APPS: AppDef[] = [
  {
    key: "pos",
    icon: WashingMachine,
    to: "/dashboard",
    permission: "app.pos_laundry",
    cardClasses:
      "hover:border-app-pos-100 focus-visible:ring-app-pos-500/40 hover:shadow-[0_10px_30px_-12px_rgba(217,122,31,0.35)]",
    stubClasses: "bg-app-pos-50 group-hover:bg-app-pos-100",
    iconColorClass: "text-app-pos-600",
    titleHoverClasses: "group-hover:text-app-pos-600",
  },
  {
    key: "usersRules",
    icon: KeyRound,
    to: "/users",
    permission: "app.users_rules",
    cardClasses:
      "hover:border-app-users-100 focus-visible:ring-app-users-500/40 hover:shadow-[0_10px_30px_-12px_rgba(109,75,207,0.35)]",
    stubClasses: "bg-app-users-50 group-hover:bg-app-users-100",
    iconColorClass: "text-app-users-600",
    titleHoverClasses: "group-hover:text-app-users-600",
  },
  {
    key: "zatca",
    icon: FileCheck2,
    to: "/zatca",
    permission: "app.zatca",
    cardClasses:
      "hover:border-app-zatca-100 focus-visible:ring-app-zatca-500/40 hover:shadow-[0_10px_30px_-12px_rgba(14,143,116,0.35)]",
    stubClasses: "bg-app-zatca-50 group-hover:bg-app-zatca-100",
    iconColorClass: "text-app-zatca-600",
    titleHoverClasses: "group-hover:text-app-zatca-600",
  },
];

export default function HomePage() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
        <div className="mb-14 max-w-2xl animate-fade-slide-up">
          <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
            <span className="relative inline-block pb-1">
              <span style={{ fontFamily: "var(--font-script)" }} className="text-4xl font-bold text-sky-500 sm:text-5xl">
                {t("app.name")}
              </span>
              <Squiggle className="text-sky-300" />
            </span>
          </h1>
          <p className="mt-2.5 text-base text-slate-500">
            {user ? `${t("auth.welcomeBack")}, ${user.fullNameEn}` : t("home.tagline")}
          </p>
          {user ? (
            <TrialStatus />
          ) : (
            <div className="mt-6">
              <div className="flex gap-3">
                <Link to="/register">
                  <Button>{t("home.startTrial")}</Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline">{t("home.signIn")}</Button>
                </Link>
              </div>
              <p style={{ fontFamily: "var(--font-script)" }} className="mt-3 flex items-center gap-1.5 text-lg text-slate-500">
                <span aria-hidden className="text-sky-400 rtl:-scale-x-100">
                  ↖
                </span>
                {t("home.trialNote")}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {APPS.map((app, i) => {
            const locked = user ? !can(app.permission) : false;
            return (
              <AppCard
                key={app.key}
                app={app}
                delayMs={i * 90}
                name={t(`home.apps.${app.key}.name`)}
                description={t(`home.apps.${app.key}.description`)}
                locked={locked}
                onClick={() => (user ? (locked ? undefined : navigate(app.to)) : navigate("/login"))}
              />
            );
          })}
        </div>
      </main>

      <Reveal as="section" className="relative bg-white pb-28 pt-14">
        <WaveDivider fillClassName="text-white" />
        <p className="text-center text-lg text-slate-600 sm:text-xl">
          {t("home.builtForPrefix")}{" "}
          <span className="relative inline-block pb-1">
            <span style={{ fontFamily: "var(--font-script)" }} className="text-2xl font-bold text-sky-500 sm:text-3xl">
              {t("home.builtForEmphasis")}
            </span>
            <Squiggle className="text-sky-300" />
          </span>
        </p>
        <div className="group/marquee relative mt-7 overflow-hidden marquee-fade">
          <div className="flex w-max gap-3 animate-marquee">
            {[...SEGMENTS, ...SEGMENTS].map((seg, i) => (
              <div
                key={`${seg.key}-${i}`}
                aria-hidden={i >= SEGMENTS.length}
                className="flex shrink-0 items-center gap-2.5 rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5"
              >
                <span className="text-base" aria-hidden>
                  {seg.icon}
                </span>
                <span
                  style={{ fontFamily: "var(--font-script-2)" }}
                  className="whitespace-nowrap text-lg font-bold text-slate-700"
                >
                  {t(`home.segments.${seg.key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <Footer />
    </div>
  );
}

interface SubscriptionInfo {
  isTrial: boolean;
  hasAccess: boolean;
  expiresAt: string | null;
}

/** Replaces the marketing CTA once signed in - a returning user doesn't need "start a free
 * trial" pitched at them again, they need to know when THEIR trial actually runs out. Silent
 * no-op once the org is on a paid/lifetime plan (isTrial is false), so paying customers never
 * see this. */
function TrialStatus() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    api
      .get<ApiSuccess<SubscriptionInfo>>("/billing/subscription")
      .then((res) => setInfo(res.data.data))
      .catch(() => setInfo(null));
  }, []);

  if (!info?.isTrial || !info.expiresAt) return null;

  const expiryDate = new Intl.DateTimeFormat(i18n.resolvedLanguage === "ar" ? "ar-SA" : "en-US", { dateStyle: "long" }).format(
    new Date(info.expiresAt),
  );

  return (
    // A hand-written sticky note stuck to the page, not another alert box - a strip of "washi
    // tape" pins it down at a slight tilt, the date itself is written in the second hand-drawn
    // face (Kalam), and it uses rose (not amber, which is already POS Laundry's color) so it
    // never gets mistaken for that app's identity.
    <div className="relative mt-8 inline-block -rotate-1">
      <div aria-hidden className="absolute -top-2.5 start-6 h-5 w-14 -rotate-3 bg-rose-200/80 shadow-sm" />
      <div className="rounded-md border border-rose-100 bg-[#fffaf8] px-5 py-3.5 shadow-[0_4px_14px_-6px_rgba(190,18,60,0.18)]">
        <p style={{ fontFamily: "var(--font-script-2)" }} className="text-xl font-bold leading-snug text-rose-700">
          {t(info.hasAccess ? "home.trialEndsOn" : "home.trialEnded", { date: expiryDate })}
        </p>
        <button
          onClick={() => navigate("/billing")}
          className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-500 underline underline-offset-2 transition-colors hover:text-rose-700"
        >
          {t("home.subscribeNow")}
        </button>
      </div>
    </div>
  );
}

function AppCard({
  app,
  delayMs,
  name,
  description,
  locked,
  onClick,
}: {
  app: AppDef;
  delayMs: number;
  name: string;
  description: string;
  locked: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      role="button"
      tabIndex={locked ? -1 : 0}
      onClick={locked ? undefined : onClick}
      onKeyDown={(e) => {
        if (!locked && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      style={{ animationDelay: `${delayMs}ms` }}
      className={`animate-fade-slide-up group flex overflow-hidden rounded-2xl p-0 text-start transition-[transform,box-shadow,border-color] duration-200 ${
        locked
          ? "cursor-not-allowed opacity-60"
          : `cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 ${app.cardClasses}`
      }`}
    >
      {/* The stub - same width/shape on every card, only the tint and icon change per app. */}
      <div
        className={`flex w-20 shrink-0 flex-col items-center justify-center transition-colors sm:w-24 ${
          locked ? "bg-slate-100" : app.stubClasses
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <app.icon className={locked ? "h-5 w-5 text-slate-400" : `h-5 w-5 ${app.iconColorClass}`} strokeWidth={2} aria-hidden />
        </div>
      </div>

      {/* The perforation - a dashed tear line with two punched-out notches, top and bottom. */}
      <div aria-hidden className="relative w-0 shrink-0">
        <div className="absolute inset-y-4 border-s-2 border-dashed border-slate-300" />
        <div className="absolute -top-2 start-0 h-4 w-4 -translate-x-1/2 rounded-full bg-slate-50 shadow-[inset_0_1px_2px_rgba(15,23,42,0.18)]" />
        <div className="absolute -bottom-2 start-0 h-4 w-4 -translate-x-1/2 rounded-full bg-slate-50 shadow-[inset_0_1px_2px_rgba(15,23,42,0.18)]" />
      </div>

      <div className="min-w-0 flex-1 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2
            style={{ fontFamily: "var(--font-script)" }}
            className={`text-xl font-bold leading-tight text-slate-900 transition-colors ${!locked && app.titleHoverClasses}`}
          >
            {name}
          </h2>
          {locked ? (
            <span className="mt-0.5 shrink-0 text-slate-400">🔒</span>
          ) : (
            <ArrowIcon className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-all duration-200 rtl:rotate-180 group-hover:translate-x-0.5 group-hover:text-slate-400 rtl:group-hover:-translate-x-0.5" />
          )}
        </div>
        <p className="mt-1.5 text-sm text-slate-500">{description}</p>
        {locked && <p className="mt-2 text-xs font-medium text-slate-400">{t("home.signInToOpen")}</p>}
      </div>
    </Card>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
