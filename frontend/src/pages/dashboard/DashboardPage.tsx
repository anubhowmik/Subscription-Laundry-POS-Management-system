import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";

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
          <span aria-hidden>📣</span>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { currentLocation } = useBusinessLocation();
  const locale = i18n.resolvedLanguage === "ar" ? "ar-SA" : "en-US";
  const currency = currentLocation?.currency ?? "SAR";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<DashboardSummary>>("/dashboard/summary");
      return res.data.data;
    },
  });

  const maxDaily = Math.max(1, ...(data?.salesByDay.map((d) => Number(d.total)) ?? [1]));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">{t("dashboard.title")}</h1>

      <AnnouncementBanner />

      {isLoading || !data ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("dashboard.todaySales")} value={formatMoney(data.todaySalesTotal, currency, locale)} />
            <StatCard label={t("dashboard.todayOrders")} value={String(data.todayOrderCount)} />
            <StatCard label={t("dashboard.totalCustomers")} value={String(data.totalCustomers)} />
            <StatCard label={t("dashboard.lowStock")} value={String(data.lowStockCount)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">{t("dashboard.salesLast7Days")}</h2>
              <div className="flex h-40 items-end gap-2">
                {data.salesByDay.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-sky-500"
                      style={{ height: `${(Number(d.total) / maxDaily) * 100}%`, minHeight: 2 }}
                      title={formatMoney(d.total, currency, locale)}
                    />
                    <span className="text-[10px] text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">{t("dashboard.recentSales")}</h2>
              <div className="space-y-2">
                {data.recentSales.length === 0 && <p className="text-sm text-slate-400">{t("common.noResults")}</p>}
                {data.recentSales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-700 ltr-nums">{s.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">
                        {i18n.resolvedLanguage === "ar" ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn} ·{" "}
                        {formatDate(s.createdAt, locale)}
                      </p>
                    </div>
                    <span className="ltr-nums font-semibold text-slate-800">{formatMoney(s.totalAmount, currency, locale)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
