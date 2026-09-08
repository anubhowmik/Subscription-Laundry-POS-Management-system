import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wallet, ShoppingBag, Users, PackageX, Megaphone } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { StatCard } from "../../components/ui/StatCard";
import { LoadingState } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { useCurrentApp } from "../../components/layout/Sidebar";

interface ActiveAnnouncement {
  id: string;
  content: string;
  locations: { businessLocation: { branchName: string } }[];
}

function AnnouncementBanner() {
  // Scope is derived server-side from the user's full permitted-location set (not just whichever
  // branch happens to be selected right now), so this needs no location param at all.
  const { data } = useQuery({
    queryKey: ["active-announcements"],
    queryFn: async () => (await api.get<ApiSuccess<ActiveAnnouncement[]>>("/announcements/active")).data.data,
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      {data.map((a) => (
        <div key={a.id} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          <p>{a.content}</p>
        </div>
      ))}
    </div>
  );
}

interface DashboardSummary {
  todaySalesTotal: number | string;
  todayOrderCount: number;
  totalCustomers: number;
  lowStockCount: number;
  lowStockProducts: { id: string; quantity: string; product: { nameEn: string; nameAr: string } }[];
  recentSales: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
    paymentStatus: string;
    createdAt: string;
    customer: { nameEn: string; nameAr: string };
  }[];
  salesByDay: { date: string; total: number | string; count: number }[];
}

const PAYMENT_BADGE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "danger",
};

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const locale = isAr ? "ar-SA" : "en-US";
  const currency = currentLocation?.currency ?? "SAR";
  // Dashboard is shared across POS Laundry/Service POS/Product POS, but "low stock" is a physical-
  // inventory concept with nothing to show for a pure service business - hide it in Service POS
  // rather than displaying a stat that's structurally always zero there. Same pattern as
  // ReportsPage.tsx's Inventory/AP Aging tabs.
  const hideLowStock = useCurrentApp()?.key === "posService";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<DashboardSummary>>("/dashboard/summary");
      return res.data.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("dashboard.title")} />
        <LoadingState label={t("common.loading")} />
      </div>
    );
  }

  const days = data.salesByDay;
  const todayTotal = Number(data.todaySalesTotal);
  const yesterdayTotal = days.length >= 2 ? Number(days[days.length - 2].total) : null;
  const trendPct = yesterdayTotal && yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100 : null;
  const maxDaily = Math.max(1, ...days.map((d) => Number(d.total)));

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} subtitle={formatDate(new Date().toISOString(), locale)} />

      <AnnouncementBanner />

      {/* KPI tile row - one card per headline metric, colored icon square + big value + a trend
          badge only where there's real day-over-day data to back it (never a fabricated %). */}
      <div className={`grid grid-cols-2 gap-4 ${hideLowStock ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <StatCard
          icon={Wallet}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={t("dashboard.todaySales")}
          value={formatMoney(todayTotal, currency, locale)}
          trendPct={trendPct}
          trendLabel={trendPct !== null ? (isAr ? "عن الأمس" : "vs yesterday") : undefined}
        />
        <StatCard
          icon={ShoppingBag}
          cardBg="bg-sky-50"
          iconBg="bg-sky-500"
          iconColor="text-white"
          label={t("dashboard.todayOrders")}
          value={String(data.todayOrderCount)}
        />
        <StatCard
          icon={Users}
          cardBg="bg-app-users-50"
          iconBg="bg-app-users-500"
          iconColor="text-white"
          label={t("dashboard.totalCustomers")}
          value={String(data.totalCustomers)}
        />
        {!hideLowStock && (
          <StatCard
            icon={PackageX}
            cardBg="bg-rose-50"
            iconBg="bg-rose-500"
            iconColor="text-white"
            label={t("dashboard.lowStock")}
            value={String(data.lowStockCount)}
            warn={data.lowStockCount > 0}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-5 text-sm font-semibold text-slate-800">{t("dashboard.salesLast7Days")}</h2>
          <SalesChart days={days} maxDaily={maxDaily} currency={currency} locale={locale} />
        </Card>

        <Card className="flex flex-col p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">{t("dashboard.recentSales")}</h2>
          {data.recentSales.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title={t("common.noResults")} />
            </div>
          ) : (
            <div className="-mx-1 mt-2 flex-1 space-y-0.5 overflow-y-auto">
              {data.recentSales.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-2 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="ltr-nums text-sm font-medium text-slate-800">{s.invoiceNumber}</p>
                    <p className="truncate text-xs text-slate-400">
                      {isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn} · {formatDate(s.createdAt, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="ltr-nums text-sm font-semibold text-slate-800">{formatMoney(s.totalAmount, currency, locale)}</p>
                    <Badge variant={PAYMENT_BADGE[s.paymentStatus] ?? "neutral"} className="mt-0.5">
                      {s.paymentStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SecondaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 first:pt-4 last:pb-4">
      <span className="flex items-center gap-2.5 text-sm text-slate-500">
        <Icon className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        {label}
      </span>
      <span className={`ltr-nums text-lg font-semibold ${tone === "warn" && Number(value) > 0 ? "text-amber-600" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

const CHART_HEIGHT = 176; // px - an explicit, definite height so child bars' percentage heights
// actually resolve. The previous version nested a `height: X%` bar inside an auto-height flex
// item, which CSS resolves to 0 against an indefinite parent - so every bar silently collapsed
// to its minHeight fallback regardless of the real value. Fixed here by giving each column an
// explicit pixel height (matching this constant) before any percentage math happens inside it.

function SalesChart({
  days,
  maxDaily,
  currency,
  locale,
}: {
  days: { date: string; total: number | string; count: number }[];
  maxDaily: number;
  currency: string;
  locale: string;
}) {
  const gridLines = [1, 0.75, 0.5, 0.25, 0];
  return (
    <div className="flex gap-3">
      <div style={{ height: CHART_HEIGHT }} className="flex flex-col justify-between text-end text-[11px] text-slate-400">
        {gridLines.map((g) => (
          <span key={g} className="ltr-nums -translate-y-1/2">
            {g === 0 ? "0" : formatMoney(maxDaily * g, currency, locale).replace(/\.00$/, "")}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div style={{ height: CHART_HEIGHT }} className="relative flex gap-2.5">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {gridLines.map((g) => (
              <div key={g} className="border-t border-slate-100" />
            ))}
          </div>
          {days.map((d) => {
            const total = Number(d.total);
            const barHeightPct = Math.max((total / maxDaily) * 100, total > 0 ? 3 : 0);
            return (
              <div key={d.date} style={{ height: CHART_HEIGHT }} className="group relative flex flex-1 flex-col justify-end">
                {total > 0 && (
                  <span className="ltr-nums pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {formatMoney(total, currency, locale)}
                  </span>
                )}
                <div className="relative w-full" style={{ height: `${barHeightPct}%` }}>
                  <div className="h-full w-full rounded-t-md bg-app-pos-500/80 transition-colors group-hover:bg-app-pos-500" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-2.5">
          {days.map((d) => (
            <span key={d.date} className="flex-1 text-center text-[11px] text-slate-400">
              {d.date.slice(5)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
