import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Wallet,
  ShoppingBag,
  Users,
  PackageX,
  Megaphone,
  TrendingUp,
  AlertCircle,
  Receipt,
  CreditCard,
  Activity,
  ShieldCheck,
  Trophy,
  Zap,
  ShoppingCart,
  UserPlus,
  FileText,
  PlusCircle,
  ChevronDown,
} from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { StatCard } from "../../components/ui/StatCard";
import { DonutChart } from "../../components/ui/DonutChart";
import { LoadingState } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { CARD_ACCENT_PALETTE } from "../../lib/cardPalette";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { cn } from "../../lib/cn";

interface ActiveAnnouncement {
  id: string;
  content: string;
  locations: { businessLocation: { branchName: string } }[];
}

function AnnouncementBanner() {
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

type DayMetric = { date: string; total: number | string; count: number; profit: number | string; newCustomers: number };

interface DashboardSummary {
  todaySalesTotal: number | string;
  yesterdaySalesTotal: number | string;
  todayOrderCount: number;
  yesterdayOrderCount: number;
  totalCustomers: number;
  yesterdayCustomerCount: number;
  lowStockCount: number;
  lowStockProducts: { id: string; quantity: string; product: { nameEn: string; nameAr: string } }[];
  recentSales: unknown[];
  salesByDay: DayMetric[];
  totalRevenue: number | string;
  totalOrders: number;
  totalProfit: number | string;
  outstandingDue: number | string;
  paymentMethodBreakdown: { paymentMethodId: string; nameEn: string; nameAr: string; code: string; total: number | string }[];
  topItems: { id: string; kind: "PRODUCT" | "SERVICE"; nameEn: string; nameAr: string; quantity: number | string; revenue: number | string }[];
  activities: { id: string; kind: "SALE" | "PAYMENT" | "LOW_STOCK" | "PRODUCT"; at: string; titleEn: string; titleAr: string; subtitleEn: string; subtitleAr: string }[];
}

function pctChange(today: number, yesterday: number): number | null {
  if (yesterday <= 0) return null;
  return ((today - yesterday) / yesterday) * 100;
}

const ACTIVITY_ICON: Record<DashboardSummary["activities"][number]["kind"], { icon: typeof Activity; bg: string; color: string }> = {
  SALE: { icon: Receipt, bg: "bg-app-pos-50", color: "text-app-pos-600" },
  PAYMENT: { icon: ShieldCheck, bg: "bg-emerald-50", color: "text-emerald-600" },
  LOW_STOCK: { icon: AlertCircle, bg: "bg-rose-50", color: "text-rose-600" },
  PRODUCT: { icon: PlusCircle, bg: "bg-sky-50", color: "text-sky-600" },
};

const PERIOD_OPTIONS = [
  { value: "7d", labelEn: "Last 7 Days", labelAr: "آخر 7 أيام" },
  { value: "30d", labelEn: "Last 30 Days", labelAr: "آخر 30 يومًا" },
  { value: "90d", labelEn: "Last 90 Days", labelAr: "آخر 90 يومًا" },
  { value: "thisYear", labelEn: "This Year", labelAr: "هذا العام" },
] as const;

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { user, can } = useAuth();
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
    queryFn: async () => (await api.get<ApiSuccess<DashboardSummary>>("/dashboard/summary")).data.data,
    refetchInterval: 60_000,
  });

  const [period, setPeriod] = useState<(typeof PERIOD_OPTIONS)[number]["value"]>("7d");
  const [metric, setMetric] = useState<"sales" | "orders" | "profit">("sales");
  const { data: overview } = useQuery({
    queryKey: ["dashboard-sales-overview", period],
    queryFn: async () => (await api.get<ApiSuccess<{ period: string; buckets: { date: string; sales: number | string; orders: number; profit: number | string }[] }>>("/dashboard/sales-overview", { params: { period } })).data.data,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? (isAr ? "صباح الخير" : "Good Morning") : hour < 17 ? (isAr ? "مساء الخير" : "Good Afternoon") : isAr ? "مساء الخير" : "Good Evening";

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("dashboard.title")} />
        <LoadingState label={t("common.loading")} />
      </div>
    );
  }

  const todayTotal = Number(data.todaySalesTotal);
  const yesterdayTotal = Number(data.yesterdaySalesTotal);
  const salesSparkline = data.salesByDay.map((d) => Number(d.total));
  const ordersSparkline = data.salesByDay.map((d) => d.count);
  const profitSparkline = data.salesByDay.map((d) => Number(d.profit));
  const customersSparkline = data.salesByDay.map((d) => d.newCustomers);

  const paymentTotal = data.paymentMethodBreakdown.reduce((sum, p) => sum + Number(p.total), 0);
  const donutSegments = data.paymentMethodBreakdown.map((p, i) => ({
    label: isAr ? p.nameAr || p.nameEn : p.nameEn,
    value: Number(p.total),
    color: CARD_ACCENT_PALETTE[i % CARD_ACCENT_PALETTE.length],
  }));

  const chartBuckets = overview?.buckets ?? [];
  const chartValues = chartBuckets.map((b) => (metric === "sales" ? Number(b.sales) : metric === "orders" ? b.orders : Number(b.profit)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${isAr ? user?.fullNameAr || user?.fullNameEn : user?.fullNameEn} 👋`}
        subtitle={`${isAr ? "إليك ما يحدث في متجرك اليوم" : "Here's what's happening in your store today"} · ${formatDate(new Date().toISOString(), locale)}`}
      />

      <AnnouncementBanner />

      {/* KPI tile row - one card per headline metric, colored icon square + big value + a trend
          badge and a real per-metric sparkline only where there's genuine day-over-day data
          behind it (see salesByDay's own comment on why Outstanding Due gets neither). */}
      <div className={`grid grid-cols-2 gap-4 ${hideLowStock ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-3 xl:grid-cols-6"}`}>
        <StatCard
          icon={Wallet}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={t("dashboard.todaySales")}
          value={formatMoney(todayTotal, currency, locale)}
          trendPct={pctChange(todayTotal, yesterdayTotal)}
          trendLabel={isAr ? "عن الأمس" : "vs yesterday"}
          sparkline={salesSparkline}
        />
        <StatCard
          icon={TrendingUp}
          cardBg="bg-teal-50"
          iconBg="bg-teal-500"
          iconColor="text-white"
          label={isAr ? "إجمالي الإيرادات" : "Total Revenue"}
          value={formatMoney(data.totalRevenue, currency, locale)}
          sparkline={salesSparkline}
          sparklineColor="#14B8A6"
        />
        <StatCard
          icon={ShoppingBag}
          cardBg="bg-sky-50"
          iconBg="bg-sky-500"
          iconColor="text-white"
          label={isAr ? "إجمالي الطلبات" : "Total Orders"}
          value={String(data.totalOrders)}
          trendPct={pctChange(data.todayOrderCount, data.yesterdayOrderCount)}
          trendLabel={isAr ? "عن الأمس" : "vs yesterday"}
          sparkline={ordersSparkline}
          sparklineColor="#38BDF8"
        />
        <StatCard
          icon={Users}
          cardBg="bg-app-users-50"
          iconBg="bg-app-users-500"
          iconColor="text-white"
          label={t("dashboard.totalCustomers")}
          value={String(data.totalCustomers)}
          trendPct={pctChange(data.totalCustomers, data.yesterdayCustomerCount)}
          trendLabel={isAr ? "عن الأمس" : "vs yesterday"}
          sparkline={customersSparkline}
          sparklineColor="#7C6FE0"
        />
        <StatCard
          icon={Trophy}
          cardBg="bg-amber-50"
          iconBg="bg-amber-500"
          iconColor="text-white"
          label={isAr ? "إجمالي الربح" : "Total Profit"}
          value={formatMoney(data.totalProfit, currency, locale)}
          sparkline={profitSparkline}
          sparklineColor="#F59E0B"
        />
        <StatCard
          icon={AlertCircle}
          cardBg="bg-rose-50"
          iconBg="bg-rose-500"
          iconColor="text-white"
          label={isAr ? "المستحق" : "Outstanding Due"}
          value={formatMoney(data.outstandingDue, currency, locale)}
          warn={Number(data.outstandingDue) > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(["sales", "orders", "profit"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    metric === m ? "bg-white text-app-pos-600 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {m === "sales" ? (isAr ? "المبيعات" : "Sales") : m === "orders" ? (isAr ? "الطلبات" : "Orders") : isAr ? "الربح" : "Profit"}
                </button>
              ))}
            </div>
            <div className="relative">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as typeof period)}
                className="ltr-nums appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pe-8 ps-3 text-xs font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-app-pos-300"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {isAr ? p.labelAr : p.labelEn}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
          </div>
          <OverviewLineChart dates={chartBuckets.map((b) => b.date)} values={chartValues} metric={metric} currency={currency} locale={locale} />
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-slate-800">{isAr ? "طريقة الدفع" : "Payment Method"}</h2>
          </div>
          {donutSegments.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title={t("common.noResults")} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <DonutChart segments={donutSegments} centerValue={formatMoney(paymentTotal, currency, locale)} centerLabel={isAr ? "الإجمالي" : "Total Sales"} />
              <div className="w-full space-y-1.5">
                {data.paymentMethodBreakdown.map((p, i) => (
                  <div key={p.paymentMethodId} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CARD_ACCENT_PALETTE[i % CARD_ACCENT_PALETTE.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{isAr ? p.nameAr || p.nameEn : p.nameEn}</span>
                    <span className="ltr-nums shrink-0 font-semibold text-slate-800">{formatMoney(p.total, currency, locale)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-slate-800">{isAr ? "الأنشطة الأخيرة" : "Recent Activities"}</h2>
          </div>
          {data.activities.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title={t("common.noResults")} />
            </div>
          ) : (
            <div className="-mx-1 flex-1 space-y-3 overflow-y-auto">
              {data.activities.map((a) => {
                const meta = ACTIVITY_ICON[a.kind];
                const Icon = meta.icon;
                return (
                  <div key={a.id} className="flex items-start gap-2.5 px-1">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.bg)}>
                      <Icon className={cn("h-4 w-4", meta.color)} strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">{isAr ? a.titleAr : a.titleEn}</p>
                      <p className="truncate text-[11px] text-slate-400">{isAr ? a.subtitleAr : a.subtitleEn}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800">{isAr ? "الأصناف الأكثر مبيعًا" : "Top Selling Items"}</h2>
            </div>
            <span className="text-[11px] text-slate-400">{isAr ? "آخر 30 يومًا" : "Last 30 days"}</span>
          </div>
          {data.topItems.length === 0 ? (
            <EmptyState title={t("common.noResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-start text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2 text-start font-medium">#</th>
                    <th className="py-2 text-start font-medium">{isAr ? "الصنف" : "Item"}</th>
                    <th className="py-2 text-end font-medium">{isAr ? "المباع" : "Sold"}</th>
                    <th className="py-2 text-end font-medium">{isAr ? "الإيرادات" : "Revenue"}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((item, i) => (
                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 text-slate-400">{i + 1}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${CARD_ACCENT_PALETTE[i % CARD_ACCENT_PALETTE.length]}1A` }}
                          >
                            <ShoppingBag className="h-4 w-4" style={{ color: CARD_ACCENT_PALETTE[i % CARD_ACCENT_PALETTE.length] }} strokeWidth={2} aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{isAr ? item.nameAr || item.nameEn : item.nameEn}</p>
                            <Badge variant="neutral" className="mt-0.5 !text-[10px]">
                              {item.kind === "PRODUCT" ? (isAr ? "منتج" : "Product") : isAr ? "خدمة" : "Service"}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="ltr-nums py-2.5 text-end text-slate-600">{Number(item.quantity)}</td>
                      <td className="ltr-nums py-2.5 text-end font-semibold text-slate-800">{formatMoney(item.revenue, currency, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
              <h2 className="text-sm font-semibold text-slate-800">{isAr ? "تنبيه المخزون المنخفض" : "Low Stock Alert"}</h2>
            </div>
            {!hideLowStock && <Badge variant={data.lowStockCount > 0 ? "danger" : "neutral"}>{data.lowStockCount} {isAr ? "صنف" : "Items"}</Badge>}
          </div>
          {hideLowStock ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title={isAr ? "غير متاح لهذا التطبيق" : "Not applicable here"} />
            </div>
          ) : data.lowStockCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <ShieldCheck className="h-8 w-8 text-emerald-500" strokeWidth={1.5} aria-hidden />
              <p className="text-sm text-emerald-600">{isAr ? "جميع مستويات المخزون جيدة" : "All stock levels are healthy"}</p>
            </div>
          ) : (
            <div className="-mx-1 flex-1 space-y-1 overflow-y-auto">
              {data.lowStockProducts.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{isAr ? s.product.nameAr || s.product.nameEn : s.product.nameEn}</span>
                  <span className="ltr-nums shrink-0 font-semibold text-rose-600">{s.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
            <h2 className="text-sm font-semibold text-slate-800">{isAr ? "إجراءات سريعة" : "Quick Actions"}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {can("pos.access") && (
              <QuickActionButton icon={ShoppingCart} label={isAr ? "بيع جديد" : "New Sale"} color="#263BAA" onClick={() => navigate("/pos")} />
            )}
            {can("products.create") && (
              <QuickActionButton icon={PlusCircle} label={isAr ? "إضافة منتج" : "Add Product"} color="#14B8A6" onClick={() => navigate("/products")} />
            )}
            {can("customers.create") && (
              <QuickActionButton icon={UserPlus} label={isAr ? "إضافة عميل" : "Add Customer"} color="#F59E0B" onClick={() => navigate("/customers")} />
            )}
            {can("sales.create") && (
              <QuickActionButton icon={FileText} label={isAr ? "إنشاء فاتورة" : "Create Invoice"} color="#7C6FE0" onClick={() => navigate("/sales/create")} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickActionButton({ icon: Icon, label, color, onClick }: { icon: typeof ShoppingCart; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center transition-colors hover:border-slate-200 hover:bg-slate-50"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110" style={{ backgroundColor: `${color}1A` }}>
        <Icon className="h-5 w-5" style={{ color }} strokeWidth={2} aria-hidden />
      </div>
      <span className="text-[11px] font-medium leading-tight text-slate-600">{label}</span>
    </button>
  );
}

const CHART_HEIGHT = 176; // px - see the original bar-chart's own comment on why this must be an
// explicit pixel value rather than left to resolve against an indefinite parent.

function OverviewLineChart({
  dates,
  values,
  metric,
  currency,
  locale,
}: {
  dates: string[];
  values: number[];
  metric: "sales" | "orders" | "profit";
  currency: string;
  locale: string;
}) {
  if (dates.length === 0) {
    return <div style={{ height: CHART_HEIGHT }} className="flex items-center justify-center text-sm text-slate-400">{locale.startsWith("ar") ? "لا توجد بيانات" : "No data"}</div>;
  }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const color = metric === "sales" ? "#263BAA" : metric === "orders" ? "#38BDF8" : "#F59E0B";
  const gridLines = [1, 0.75, 0.5, 0.25, 0];
  const fmt = (v: number) => (metric === "orders" ? String(Math.round(v)) : formatMoney(v, currency, locale).replace(/\.00$/, ""));

  const points = values.map((v, i) => {
    const x = dates.length > 1 ? (i / (dates.length - 1)) * 100 : 50;
    const y = 100 - ((v - min) / range) * 100;
    return { x, y };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L100,100 L0,100 Z`;

  // Show at most ~10 x-axis labels even for a 90-day / 12-month series, otherwise they'd overlap
  // into an unreadable smear.
  const labelStep = Math.max(1, Math.ceil(dates.length / 10));

  return (
    <div className="flex gap-3">
      <div style={{ height: CHART_HEIGHT }} className="flex flex-col justify-between text-end text-[11px] text-slate-400">
        {gridLines.map((g) => (
          <span key={g} className="ltr-nums -translate-y-1/2">
            {g === 0 ? "0" : fmt(min + range * g)}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div style={{ height: CHART_HEIGHT }} className="relative">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {gridLines.map((g) => (
              <div key={g} className="border-t border-slate-100" />
            ))}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <path d={areaPath} fill={color} opacity={0.08} />
            <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {points.map((p, i) => (
            <div
              key={i}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <div className="h-1.5 w-1.5 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-150" style={{ backgroundColor: color }} />
              <span className="ltr-nums pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {fmt(values[i])}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex">
          {dates.map((d, i) => (
            <span key={d} className="ltr-nums flex-1 text-center text-[10px] text-slate-400">
              {i % labelStep === 0 ? d.slice(5) : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
