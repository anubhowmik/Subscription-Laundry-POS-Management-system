import { useEffect, useRef, useState, type ElementType } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrentAppStore } from "../../stores/currentAppStore";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Button } from "../../components/ui/Button";
import { Reveal } from "../../components/ui/Reveal";
import { WaveDivider } from "../../components/ui/WaveDivider";
import { Squiggle } from "../../components/ui/Squiggle";
import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";
import { ModuleCard } from "../../components/appHome/ModuleCard";
import { PosLaundryIcon, ServicePosIcon, ProductPosIcon, UsersRulesIcon, ZatcaIcon } from "../../components/appHome/AppIcons";
import { pickAccent } from "../../lib/cardPalette";

// The five applications, each opening onto its own new card-grid landing view (see
// AppLandingPage.tsx) rather than jumping straight into a content page - see App.tsx's
// "pos-laundry"/"service-pos"/"product-pos"/"users-rules" routes (ZATCA is the one exemption,
// being a single page already). Every card gets its own accent color cycled from
// lib/cardPalette.ts (2026-09-08 design overhaul, matching the user's own reference mockup) -
// apps are told apart by icon and label, not by a fixed per-app hue.
interface AppDef {
  key: string;
  /** A realistic, hand-drawn multi-part illustration specific to this launcher (see
   * appHome/AppIcons.tsx) - deliberately NOT the same simple Lucide glyph the app's own Sidebar
   * uses (WashingMachine/ShoppingCart/etc.), since those single-stroke icons read as generic
   * placeholders at Home's much larger, hover-animated card size; the Sidebar keeps its compact
   * Lucide icon, where a detailed illustration would just be visual noise at ~18px. */
  icon: ElementType<{ className?: string; color?: string }>;
  to: string;
  permission: string;
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
  { key: "pos", icon: PosLaundryIcon, to: "/pos-laundry", permission: "app.pos_laundry" },
  { key: "posService", icon: ServicePosIcon, to: "/service-pos", permission: "app.pos_service" },
  { key: "posProduct", icon: ProductPosIcon, to: "/product-pos", permission: "app.pos_product" },
  { key: "usersRules", icon: UsersRulesIcon, to: "/users-rules", permission: "app.users_rules" },
  { key: "zatca", icon: ZatcaIcon, to: "/zatca", permission: "app.zatca" },
];

/** Jumps to the section named by the URL hash (Header's #apps/#industries/#pricing links) - a
 * plain react-router <Link to="/#apps"> only updates the URL, it doesn't scroll on its own. */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);
}

// Every card is a fixed 220px (see ModuleCard's width/height props) and the grid's own gap is
// 20px (gap-5), so two full rows are always exactly this tall, regardless of how many columns
// actually fit at the current width - the one number this whole "collapse after 2 rows" feature
// is built on.
const CARD_SIZE = 220;
const GRID_GAP = 20;
const TWO_ROW_HEIGHT = CARD_SIZE * 2 + GRID_GAP;

/** Collapses the app grid to its first two rows, revealing the rest behind a Show more button -
 * only actually needed once there are enough apps that a given screen width wraps to a 3rd row,
 * so this measures the grid's real (unclamped) content height via ResizeObserver rather than
 * assuming a fixed apps-per-row count that would immediately go stale on a different screen width
 * or app count. */
function useShowMoreGrid() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const check = () => setHasMore(el.scrollHeight > TWO_ROW_HEIGHT + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { gridRef, hasMore, expanded, setExpanded };
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  useScrollToHash();
  const { gridRef, hasMore, expanded, setExpanded } = useShowMoreGrid();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-20 pt-16 sm:pt-20">
        <div className="mx-auto max-w-2xl animate-fade-slide-up text-center">
          {/* The brand headline/subline is the page's identity, not just an acquisition pitch -
              it stays for a returning signed-in user too, not swapped out for a plain "Welcome
              back" heading. Only the acquisition-specific bits below it (Start Free Trial CTA,
              the price callout) are logged-out only. */}
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            {t("home.heroLine1")}
            <br />
            <span className="relative inline-block pb-1.5">
              <span style={{ fontFamily: "var(--font-script)" }}>{t("home.heroHighlight")}</span>
              <Squiggle className="text-amber-300" />
            </span>
          </h1>
          <p className="mt-5 text-xl text-slate-500 sm:text-2xl">
            {t("home.heroSubPrefix")}{" "}
            <span className="relative inline-block pb-1">
              <span style={{ fontFamily: "var(--font-script)" }} className="text-slate-900">
                {t("home.heroSubHighlight")}
              </span>
              <Squiggle className="text-sky-300" />
            </span>
          </p>

          {user ? (
            <>
              <p className="mt-4 text-base text-slate-500">
                {t("auth.welcomeBack")}, {user.fullNameEn}
              </p>
              <TrialStatus />
            </>
          ) : (
            <>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to="/register">
                  <Button>{t("home.startTrial")}</Button>
                </Link>
                <a href="mailto:hello@saudilaundry.example.com">
                  <Button variant="outline">{t("home.talkToUs")}</Button>
                </a>
              </div>

              <div id="pricing" className="mt-7 scroll-mt-24">
                <span
                  style={{ fontFamily: "var(--font-script)" }}
                  className="inline-block -rotate-1 rounded-lg border-[1.5px] border-dashed border-sky-600 bg-sky-100 px-5 py-2 text-lg font-bold text-sky-700"
                >
                  {t("home.priceCallout")}
                </span>
              </div>
            </>
          )}
        </div>

        <div id="apps" className="mt-20 scroll-mt-20 sm:mt-24">
          <div className="mx-auto max-w-xl text-center">
            <span className="inline-block rounded-full border border-sky-600/15 bg-sky-600/[0.08] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-600">
              {t("home.appsPill")}
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t("home.appsHeading")}{" "}
              <span className="relative inline-block pb-1">
                <span style={{ fontFamily: "var(--font-script)" }} className="text-sky-500">
                  {t("home.appsHeadingHighlight")}
                </span>
                <Squiggle className="text-sky-300" />
              </span>
            </h2>
            <p className="mt-3 text-base text-slate-500">{t("home.appsSubtitle")}</p>
          </div>

          {/* flex-wrap + justify-center (not CSS grid) so a short last row centers its own
              leftover cards too - grid's auto-placement always starts a partial row from the
              start side, leaving it lopsided toward that side instead of centered as a block.
              Every card gets an explicit pixel width/height (see ModuleCard's width/height
              props) rather than a wrapper div's CSS class - that's what guarantees every card is
              really identical regardless of its own title/description length, with nothing
              (flex stretch, percentage heights, content-driven sizing) left to go wrong. */}
          <div className="relative mt-12">
            <div
              ref={gridRef}
              className="flex flex-wrap justify-center gap-5 overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{ maxHeight: expanded || !hasMore ? undefined : TWO_ROW_HEIGHT }}
            >
              {APPS.map((app, i) => {
                const locked = user ? !can(app.permission) : false;
                return (
                  <ModuleCard
                    key={app.key}
                    width={220}
                    height={220}
                    to={app.to}
                    icon={app.icon}
                    title={t(`home.apps.${app.key}.name`)}
                    description={t(`home.apps.${app.key}.description`)}
                    accentColor={pickAccent(i)}
                    exploreLabel={t("common.explore")}
                    delayMs={i * 70}
                    locked={locked}
                    lockedHint={t("home.signInToOpen")}
                    onClick={() => {
                      if (!user) return navigate("/login");
                      if (locked) return;
                      // Recorded explicitly (not derived from the URL) so Sidebar.tsx's
                      // useCurrentApp() knows which app you opened even for a page shared by
                      // more than one (e.g. Customers is reachable from POS Laundry, Service
                      // POS, and Product POS) - see currentAppStore.ts.
                      useCurrentAppStore.getState().setApp(app.key);
                      navigate(app.to);
                    }}
                  />
                );
              })}
            </div>

            {/* Fades the clipped 3rd row into the page background rather than cutting it off
                with a hard edge, so "there's more below" reads visually, not just via the label
                on the button underneath. */}
            {hasMore && !expanded && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-50 to-transparent"
              />
            )}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => setExpanded((e) => !e)}>
                {expanded ? t("common.showLess") : t("common.showMore")}
              </Button>
            </div>
          )}
        </div>
      </main>

      <Reveal id="industries" as="section" className="relative scroll-mt-16 bg-white pb-28 pt-14">
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

