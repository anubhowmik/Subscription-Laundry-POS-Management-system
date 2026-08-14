import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

interface NavItem {
  to: string;
  labelKey: string;
  permissions?: string[];
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", icon: "📊" },
  { to: "/pos", labelKey: "nav.pos", permissions: ["pos.access"], icon: "🧾" },
  { to: "/sales", labelKey: "nav.sales", permissions: ["sales.view"], icon: "💵" },
  { to: "/orders", labelKey: "nav.orders", permissions: ["sales.view"], icon: "🧾" },
  { to: "/quotes", labelKey: "nav.quotes", permissions: ["sales.quote"], icon: "📝" },
  { to: "/sell-returns", labelKey: "nav.sellReturns", permissions: ["sales.return"], icon: "↩️" },
  { to: "/suppliers", labelKey: "nav.suppliers", permissions: ["suppliers.manage"], icon: "🚚" },
  { to: "/purchases", labelKey: "nav.purchases", permissions: ["purchases.manage"], icon: "🧾" },
  { to: "/expenses", labelKey: "nav.expenses", permissions: ["expenses.view"], icon: "💸" },
  { to: "/inventory-postings", labelKey: "nav.inventoryPostings", permissions: ["inventory_postings.manage"], icon: "📐" },
  { to: "/register-sessions", labelKey: "nav.registerSessions", permissions: ["pos.register.manage"], icon: "🗄️" },
  { to: "/messages", labelKey: "nav.messages", permissions: ["messages.manage"], icon: "✉️" },
  { to: "/announcements", labelKey: "nav.announcements", permissions: ["announcements.manage"], icon: "📣" },
  { to: "/customers", labelKey: "nav.customers", permissions: ["customers.view"], icon: "👥" },
  { to: "/customer-groups", labelKey: "nav.customerGroups", permissions: ["customer_groups.view"], icon: "🧑‍🤝‍🧑" },
  { to: "/reports", labelKey: "nav.reports", permissions: ["reports.sales", "reports.inventory"], icon: "📊" },
  { to: "/inventory", labelKey: "nav.inventory", permissions: ["inventory.view", "inventory.adjust", "inventory.transfer"], icon: "📋" },
  { to: "/compensations", labelKey: "nav.compensations", permissions: ["compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all"], icon: "🛡️" },
  { to: "/bookings", labelKey: "nav.bookings", permissions: ["bookings.manage"], icon: "📅" },
  { to: "/notifications", labelKey: "nav.notifications", permissions: ["settings.manage"], icon: "💬" },
  { to: "/organization-settings", labelKey: "nav.organizationSettings", permissions: ["settings.manage"], icon: "⚙️" },
  { to: "/products", labelKey: "nav.products", permissions: ["products.view"], icon: "📦" },
  { to: "/services", labelKey: "nav.services", permissions: ["services.view"], icon: "🧺" },
  { to: "/users", labelKey: "nav.users", permissions: ["users.view"], icon: "🔑" },
  { to: "/roles", labelKey: "nav.roles", permissions: ["roles.view"], icon: "🛡️" },
  { to: "/business-locations", labelKey: "nav.businessLocations", permissions: ["business_locations.update"], icon: "🏢" },
  { to: "/coupons", labelKey: "nav.coupons", permissions: ["coupons.manage"], icon: "🎟️" },
  { to: "/price-lists", labelKey: "nav.priceLists", permissions: ["price-lists.manage"], icon: "💲" },
  { to: "/billing", labelKey: "nav.subscription", icon: "💳" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const { data: unreadCount } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: async () => (await api.get<ApiSuccess<{ count: number }>>("/messages/unread-count")).data.data.count,
    enabled: can("messages.manage"),
    refetchInterval: 60_000,
  });

  return (
    <aside className="hidden w-60 shrink-0 border-e border-slate-200 bg-white md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <span className="text-xl">🧼</span>
        <span className="font-semibold text-slate-800">{t("app.name")}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.filter((item) => !item.permissions || can(...item.permissions)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100"
              }`
            }
          >
            <span aria-hidden>{item.icon}</span>
            <span className="flex-1">{t(item.labelKey)}</span>
            {item.to === "/messages" && Boolean(unreadCount) && (
              <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
