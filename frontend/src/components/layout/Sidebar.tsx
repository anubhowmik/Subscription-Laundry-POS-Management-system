import { useEffect, type ElementType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
  LayoutGrid,
  ShoppingCart,
  Receipt,
  Package,
  FileText,
  Undo2,
  CalendarClock,
  Users,
  UsersRound,
  ShoppingBasket,
  WashingMachine,
  ClipboardList,
  Truck,
  ShoppingBag,
  ClipboardCheck,
  Wallet,
  HandCoins,
  Ticket,
  Tags,
  Archive,
  BarChart3,
  Mail,
  Megaphone,
  KeyRound,
  ShieldCheck,
  Fingerprint,
  Award,
  FileCheck2,
  Building2,
  Bell,
  Settings,
  CreditCard,
  Banknote,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { useMobileNavStore } from "../../stores/mobileNavStore";
import { useCurrentAppStore } from "../../stores/currentAppStore";
import { PosLaundryIcon, ServicePosIcon, ProductPosIcon, UsersRulesIcon, ZatcaIcon } from "../appHome/AppIcons";
import { pickAccent } from "../../lib/cardPalette";

export interface NavItem {
  to: string;
  labelKey: string;
  permissions?: string[];
  icon: LucideIcon;
  /** Marks an item as exclusive to one POS mode's dedicated app (Service POS / Product POS), or
   * to POS Laundry itself ("laundry" - e.g. quick links into the other two apps, which would
   * otherwise duplicate those apps' own dedicated screen link when derived). Omitted means
   * shared, appearing in POS Laundry and both of the other two apps. See deriveModeSections()
   * below, which filters NAV_SECTIONS by this tag. Has no effect on POS Laundry itself, which
   * always shows every item regardless of tag. */
  only?: "service" | "product" | "laundry";
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "nav.section.overview",
    items: [
      // The card-grid landing view (see AppLandingPage.tsx) - tagged "laundry" so
      // deriveModeSections() below always drops it rather than carrying POS Laundry's own
      // /pos-laundry link into Service POS's/Product POS's derived sidebars, which each get
      // their own landing link prepended instead (see SERVICE_POS_SECTIONS/PRODUCT_POS_SECTIONS).
      { to: "/pos-laundry", labelKey: "nav.modules", icon: LayoutGrid, only: "laundry" },
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "nav.section.sales",
    items: [
      // Quick links into Service POS/Product POS from right inside POS Laundry - without these
      // there's no way to reach either selling screen without first going back to Home. Tagged
      // "laundry" so deriveModeSections() never pulls them into Service POS's/Product POS's own
      // derived sidebars, where they'd duplicate that app's own screen link (already prepended
      // into its Overview section).
      { to: "/pos/service", labelKey: "nav.posService", permissions: ["pos.access.service"], icon: ShoppingCart, only: "laundry" },
      { to: "/pos/product", labelKey: "nav.posProduct", permissions: ["pos.access.product"], icon: ShoppingBasket, only: "laundry" },
      { to: "/sales", labelKey: "nav.sales", permissions: ["sales.view"], icon: Receipt },
      { to: "/orders", labelKey: "nav.orders", permissions: ["sales.view"], icon: Package, only: "service" },
      { to: "/quotes", labelKey: "nav.quotes", permissions: ["sales.quote"], icon: FileText },
      { to: "/sell-returns", labelKey: "nav.sellReturns", permissions: ["sales.return"], icon: Undo2 },
      { to: "/bookings", labelKey: "nav.bookings", permissions: ["bookings.manage"], icon: CalendarClock, only: "service" },
    ],
  },
  {
    labelKey: "nav.section.customers",
    items: [
      { to: "/customers", labelKey: "nav.customers", permissions: ["customers.view"], icon: Users },
      { to: "/customer-groups", labelKey: "nav.customerGroups", permissions: ["customer_groups.view"], icon: UsersRound },
    ],
  },
  {
    labelKey: "nav.section.catalogInventory",
    items: [
      { to: "/products", labelKey: "nav.products", permissions: ["products.view"], icon: ShoppingBasket, only: "product" },
      { to: "/services", labelKey: "nav.services", permissions: ["services.view"], icon: WashingMachine, only: "service" },
      { to: "/inventory", labelKey: "nav.inventory", permissions: ["inventory.view", "inventory.adjust", "inventory.transfer"], icon: ClipboardList, only: "product" },
      { to: "/suppliers", labelKey: "nav.suppliers", permissions: ["suppliers.manage"], icon: Truck, only: "product" },
      { to: "/purchases", labelKey: "nav.purchases", permissions: ["purchases.manage"], icon: ShoppingBag, only: "product" },
      { to: "/inventory-postings", labelKey: "nav.inventoryPostings", permissions: ["inventory_postings.manage"], icon: ClipboardCheck, only: "product" },
    ],
  },
  {
    labelKey: "nav.section.finance",
    items: [
      { to: "/expenses", labelKey: "nav.expenses", permissions: ["expenses.view"], icon: Wallet },
      { to: "/compensations", labelKey: "nav.compensations", permissions: ["compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all"], icon: HandCoins },
      { to: "/coupons", labelKey: "nav.coupons", permissions: ["coupons.manage"], icon: Ticket },
      { to: "/price-lists", labelKey: "nav.priceLists", permissions: ["price-lists.manage"], icon: Tags },
      { to: "/register-sessions", labelKey: "nav.registerSessions", permissions: ["pos.register.manage"], icon: Archive },
      { to: "/reports", labelKey: "nav.reports", permissions: ["reports.sales", "reports.inventory"], icon: BarChart3 },
    ],
  },
  {
    labelKey: "nav.section.communications",
    items: [
      { to: "/messages", labelKey: "nav.messages", permissions: ["messages.manage"], icon: Mail },
      { to: "/announcements", labelKey: "nav.announcements", permissions: ["announcements.manage"], icon: Megaphone },
    ],
  },
  {
    labelKey: "nav.section.settings",
    items: [
      { to: "/business-locations", labelKey: "nav.businessLocations", permissions: ["business_locations.update"], icon: Building2 },
      { to: "/notifications", labelKey: "nav.notifications", permissions: ["settings.manage"], icon: Bell },
      { to: "/bnpl-settings", labelKey: "nav.bnpl", permissions: ["bnpl.manage"], icon: Banknote },
      { to: "/organization-settings", labelKey: "nav.organizationSettings", permissions: ["settings.manage"], icon: Settings },
    ],
  },
];

// The Users & Rules and ZATCA KSA applications get their own top-level sidebar groups, separate
// from NAV_SECTIONS above (which is entirely the POS Laundry application's own navigation) - see
// App.tsx, where these routes are nested under their own app.users_rules/app.zatca
// PermissionRoute, matching this grouping.
const USERS_RULES_SECTION: NavSection = {
  labelKey: "nav.section.usersRules",
  items: [
    { to: "/users-rules", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/users", labelKey: "nav.users", permissions: ["users.view"], icon: KeyRound },
    { to: "/roles", labelKey: "nav.roles", permissions: ["roles.view"], icon: ShieldCheck },
    { to: "/application-access", labelKey: "nav.applicationAccess", permissions: ["users.view"], icon: Fingerprint },
    { to: "/licenses", labelKey: "nav.licenses", permissions: ["licenses.manage"], icon: Award },
    { to: "/billing", labelKey: "nav.subscription", permissions: ["licenses.manage"], icon: CreditCard },
  ],
};

const ZATCA_SECTION: NavSection = {
  labelKey: "nav.section.zatca",
  items: [{ to: "/zatca", labelKey: "nav.zatca", icon: FileCheck2 }],
};

// Service POS and Product POS carry every page POS Laundry has EXCEPT the other side's exclusive
// ones (see the `only` tags above) - derived from NAV_SECTIONS rather than hand-maintained as a
// second/third copy, so POS Laundry stays the single source of truth for "what pages exist and
// what permission each needs." Each app's own leading items (its landing grid, then its POS
// screen) are prepended into the existing Overview section since they're that app's primary
// actions - see the two call sites below.
function deriveModeSections(leadingItems: NavItem[], exclude: "service" | "product"): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    // "laundry"-tagged items (POS Laundry's own quick links into the other two apps, and its own
    // /pos-laundry landing link) are always dropped here regardless of which side is being
    // derived - they'd otherwise duplicate the leadingItems this function prepends into Overview.
    items: section.items.filter((item) => item.only !== exclude && item.only !== "laundry"),
  }))
    .filter((section) => section.items.length > 0)
    .map((section) => (section.labelKey === "nav.section.overview" ? { ...section, items: [...leadingItems, ...section.items] } : section));
}

const SERVICE_POS_SECTIONS: NavSection[] = deriveModeSections(
  [
    { to: "/service-pos", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/pos/service", labelKey: "nav.posService", permissions: ["pos.access.service"], icon: ShoppingCart },
  ],
  "product",
);

const PRODUCT_POS_SECTIONS: NavSection[] = deriveModeSections(
  [
    { to: "/product-pos", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/pos/product", labelKey: "nav.posProduct", permissions: ["pos.access.product"], icon: ShoppingBasket },
  ],
  "service",
);

// Each application is its OWN navigational shell - opening it from Home shows only that
// application's sidebar, never a combined mega-menu of everything the user can technically
// reach. Switching applications means going back to Home and picking a different card (the
// "Home" link below is always present for exactly that). This mirrors the app.pos_laundry /
// app.pos_service / app.pos_product / app.users_rules / app.zatca route grouping already
// enforced server-side in App.tsx - the path lists below are just the client-side "which app am
// I in" lookup for the same grouping.
export interface AppDef {
  key: "pos" | "posService" | "posProduct" | "usersRules" | "zatca";
  /** Same realistic multi-part illustration this app uses on its Home launcher card (see
   * appHome/AppIcons.tsx) - one consistent mark per app, not a plainer icon reserved for Home. */
  icon: ElementType<{ className?: string; color?: string }>;
  labelKey: string;
  sections: NavSection[];
  /** First path segment(s) that belong to this application, for detecting the current one from the URL. */
  paths: string[];
  /** Same per-app accent hex the Home launcher card cycles through (see lib/cardPalette.ts) -
   * assigned by this app's position here, matching Home's APPS order, so a given app carries the
   * same color in both places. Passed straight to the icon's `color` prop (these are hand-drawn
   * illustrations colored directly, not single-tone `currentColor` glyphs). */
  accentColor: string;
  activeNavClasses: string;
}

const APPS: AppDef[] = [
  {
    key: "pos",
    icon: PosLaundryIcon,
    labelKey: "home.apps.pos.name",
    sections: NAV_SECTIONS,
    // "pos" itself (the legacy combined POS screen) has no NAV_SECTIONS entry - deliberately
    // unlinked from the sidebar since Service POS/Product POS replaced it as the linked options -
    // but it must still resolve to the POS Laundry app when landed on directly (a bookmark, a
    // direct URL), or useCurrentApp() below finds no match and renders a blank sidebar shell.
    paths: [...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))), "pos"],
    accentColor: pickAccent(0),
    activeNavClasses: "bg-app-pos-50 text-app-pos-600",
  },
  {
    key: "posService",
    icon: ServicePosIcon,
    labelKey: "home.apps.posService.name",
    sections: SERVICE_POS_SECTIONS,
    paths: SERVICE_POS_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))),
    accentColor: pickAccent(1),
    activeNavClasses: "bg-app-posservice-50 text-app-posservice-600",
  },
  {
    key: "posProduct",
    icon: ProductPosIcon,
    labelKey: "home.apps.posProduct.name",
    sections: PRODUCT_POS_SECTIONS,
    paths: PRODUCT_POS_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))),
    accentColor: pickAccent(2),
    activeNavClasses: "bg-app-posproduct-50 text-app-posproduct-600",
  },
  {
    key: "usersRules",
    icon: UsersRulesIcon,
    labelKey: "home.apps.usersRules.name",
    sections: [USERS_RULES_SECTION],
    paths: USERS_RULES_SECTION.items.map((i) => i.to.slice(1)),
    accentColor: pickAccent(3),
    activeNavClasses: "bg-app-users-50 text-app-users-600",
  },
  {
    key: "zatca",
    icon: ZatcaIcon,
    labelKey: "home.apps.zatca.name",
    sections: [ZATCA_SECTION],
    paths: ZATCA_SECTION.items.map((i) => i.to.slice(1)),
    accentColor: pickAccent(4),
    activeNavClasses: "bg-app-zatca-50 text-app-zatca-600",
  },
];

function matchesPath(app: AppDef, cleanPath: string): boolean {
  return app.paths.some((p) => p === cleanPath || cleanPath.startsWith(`${p}/`));
}

// Picks the MOST SPECIFIC matching path across every app, not just the first app that matches at
// all. Needed because several apps can legitimately share a path (e.g. "customers" is shared by
// POS Laundry, Service POS and Product POS; "pos" is a prefix of both "pos/service" and
// "pos/product") - a first-match-wins scan would always resolve to whichever app happens to be
// listed first in APPS, regardless of which one is actually the better fit. Used only as the
// fallback when there's no sticky app (see useCurrentApp below) or the sticky one no longer fits.
function bestPathMatch(cleanPath: string): AppDef | undefined {
  let best: { app: AppDef; path: string } | undefined;
  for (const app of APPS) {
    for (const p of app.paths) {
      if ((p === cleanPath || cleanPath.startsWith(`${p}/`)) && (!best || p.length > best.path.length)) {
        best = { app, path: p };
      }
    }
  }
  return best?.app;
}

// Exported so pages shared across apps (e.g. ReportsPage) can adapt their own content to which
// app they're being viewed from - the alternative (each such page re-deriving "which app" itself)
// would duplicate this exact sticky+fallback logic and risk drifting out of sync with it.
export function useCurrentApp(): AppDef | undefined {
  const { pathname } = useLocation();
  const cleanPath = pathname.replace(/^\//, "");
  const stickyKey = useCurrentAppStore((s) => s.appKey);

  // Sticky: once you've opened an app from Home, its sidebar stays even when you browse into a
  // page shared with other apps (e.g. Customers) - without this, a shared page would always
  // resolve to whichever app bestPathMatch() prefers, snapping the sidebar to the wrong app the
  // moment you left that app's exclusive pages. Only trusted when the stored app actually
  // contains the current page - otherwise (direct link, a stale value from before a permission
  // change, or a browser-back that crossed an app boundary) fall back to the URL-derived guess.
  const stickyApp = stickyKey ? APPS.find((app) => app.key === stickyKey) : undefined;
  if (stickyApp && matchesPath(stickyApp, cleanPath)) return stickyApp;

  return bestPathMatch(cleanPath);
}

function SidebarHeader({ currentApp, onClose }: { currentApp: AppDef | undefined; onClose?: () => void }) {
  const { t } = useTranslation();
  const AppIcon = currentApp?.icon ?? LayoutDashboard;
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5">
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2">
          <AppIcon className="h-5 w-5 shrink-0" color={currentApp?.accentColor ?? "#263BAA"} />
          <span className="truncate text-[15px] font-semibold text-slate-900">
            {currentApp ? t(currentApp.labelKey) : t("app.name")}
          </span>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

function SidebarNav({ currentApp, onNavigate }: { currentApp: AppDef | undefined; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();

  const { data: unreadCount } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: async () => (await api.get<ApiSuccess<{ count: number }>>("/messages/unread-count")).data.data.count,
    enabled: can("messages.manage"),
    refetchInterval: 60_000,
  });

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <NavLink
        to="/"
        onClick={onNavigate}
        className="mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Home className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
        <span>{t("nav.home")}</span>
      </NavLink>

      {(currentApp?.sections ?? []).map((section) => {
        const items = section.items.filter((item) => !item.permissions || can(...item.permissions));
        if (items.length === 0) return null;
        return (
          <div key={section.labelKey}>
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t(section.labelKey)}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        isActive ? (currentApp?.activeNavClasses ?? "bg-sky-50 text-sky-700") : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
                    <span className="flex-1 truncate">{t(item.labelKey)}</span>
                    {item.to === "/messages" && Boolean(unreadCount) && (
                      <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const currentApp = useCurrentApp();
  const { pathname } = useLocation();
  const isOpen = useMobileNavStore((s) => s.isOpen);
  const close = useMobileNavStore((s) => s.close);

  // Navigating (via a link click, or a route change from anywhere else) always closes the
  // mobile drawer - nothing should be left covering the screen after the user picks a page.
  useEffect(() => close(), [pathname, close]);

  return (
    <>
      {/* Desktop: a static column, always visible at md+. */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-slate-200 bg-white md:flex">
        <SidebarHeader currentApp={currentApp} />
        <SidebarNav currentApp={currentApp} />
      </aside>

      {/* Mobile: an overlay drawer, opened via the Topbar hamburger (see useMobileNavStore) -
          below md, Sidebar renders nothing until this is open. */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={close} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <SidebarHeader currentApp={currentApp} onClose={close} />
            <SidebarNav currentApp={currentApp} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  );
}
