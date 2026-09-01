import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
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

interface NavItem {
  to: string;
  labelKey: string;
  permissions?: string[];
  icon: LucideIcon;
}

interface NavSection {
  labelKey: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "nav.section.overview",
    items: [{ to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "nav.section.sales",
    items: [
      { to: "/pos", labelKey: "nav.pos", permissions: ["pos.access"], icon: ShoppingCart },
      { to: "/sales", labelKey: "nav.sales", permissions: ["sales.view"], icon: Receipt },
      { to: "/orders", labelKey: "nav.orders", permissions: ["sales.view"], icon: Package },
      { to: "/quotes", labelKey: "nav.quotes", permissions: ["sales.quote"], icon: FileText },
      { to: "/sell-returns", labelKey: "nav.sellReturns", permissions: ["sales.return"], icon: Undo2 },
      { to: "/bookings", labelKey: "nav.bookings", permissions: ["bookings.manage"], icon: CalendarClock },
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
      { to: "/products", labelKey: "nav.products", permissions: ["products.view"], icon: ShoppingBasket },
      { to: "/services", labelKey: "nav.services", permissions: ["services.view"], icon: WashingMachine },
      { to: "/inventory", labelKey: "nav.inventory", permissions: ["inventory.view", "inventory.adjust", "inventory.transfer"], icon: ClipboardList },
      { to: "/suppliers", labelKey: "nav.suppliers", permissions: ["suppliers.manage"], icon: Truck },
      { to: "/purchases", labelKey: "nav.purchases", permissions: ["purchases.manage"], icon: ShoppingBag },
      { to: "/inventory-postings", labelKey: "nav.inventoryPostings", permissions: ["inventory_postings.manage"], icon: ClipboardCheck },
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

// Each application is its OWN navigational shell - opening it from Home shows only that
// application's sidebar, never a combined mega-menu of everything the user can technically
// reach. Switching applications means going back to Home and picking a different card (the
// "Home" link below is always present for exactly that). This mirrors the app.pos_laundry /
// app.users_rules / app.zatca route grouping already enforced server-side in App.tsx - the
// path lists below are just the client-side "which app am I in" lookup for the same grouping.
interface AppDef {
  key: "pos" | "usersRules" | "zatca";
  icon: LucideIcon;
  labelKey: string;
  sections: NavSection[];
  /** First path segment(s) that belong to this application, for detecting the current one from the URL. */
  paths: string[];
  /** Same per-app identity color as the Home launcher card (see HomePage.tsx's APPS array) -
   * literal classes, not built from a template string, so Tailwind's scanner can see them. */
  iconColorClass: string;
  activeNavClasses: string;
}

const APPS: AppDef[] = [
  {
    key: "pos",
    icon: WashingMachine,
    labelKey: "home.apps.pos.name",
    sections: NAV_SECTIONS,
    paths: NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))),
    iconColorClass: "text-app-pos-600",
    activeNavClasses: "bg-app-pos-50 text-app-pos-600",
  },
  {
    key: "usersRules",
    icon: KeyRound,
    labelKey: "home.apps.usersRules.name",
    sections: [USERS_RULES_SECTION],
    paths: USERS_RULES_SECTION.items.map((i) => i.to.slice(1)),
    iconColorClass: "text-app-users-600",
    activeNavClasses: "bg-app-users-50 text-app-users-600",
  },
  {
    key: "zatca",
    icon: FileCheck2,
    labelKey: "home.apps.zatca.name",
    sections: [ZATCA_SECTION],
    paths: ZATCA_SECTION.items.map((i) => i.to.slice(1)),
    iconColorClass: "text-app-zatca-600",
    activeNavClasses: "bg-app-zatca-50 text-app-zatca-600",
  },
];

function useCurrentApp(): AppDef | undefined {
  const { pathname } = useLocation();
  const segment = pathname.replace(/^\//, "").split("/")[0];
  return APPS.find((app) => app.paths.includes(segment));
}

function SidebarHeader({ currentApp, onClose }: { currentApp: AppDef | undefined; onClose?: () => void }) {
  const { t } = useTranslation();
  const AppIcon = currentApp?.icon ?? LayoutDashboard;
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5">
      <div className="flex min-w-0 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <span aria-hidden>🧼</span>
          <span>{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-2">
          <AppIcon className={`h-[18px] w-[18px] shrink-0 ${currentApp?.iconColorClass ?? "text-sky-600"}`} strokeWidth={2.25} aria-hidden />
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
