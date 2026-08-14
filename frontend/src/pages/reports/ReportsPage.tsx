import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import { formatMoney } from "../../lib/format";

type Tab = "SALES" | "INVENTORY" | "ACCOUNTING" | "BY_SERVICE" | "AR_AGING" | "AP_AGING" | "STAFF" | "VAT";

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();

  const canSales = can("reports.sales");
  const canInventory = can("reports.inventory");
  const canAccounting = can("reports.accounting");
  const [tab, setTab] = useState<Tab>(canSales ? "SALES" : canInventory ? "INVENTORY" : "ACCOUNTING");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">{isAr ? "التقارير" : "Reports"}</h1>

      <div className="flex gap-6 border-b border-slate-200">
        {canSales && (
          <button
            onClick={() => setTab("SALES")}
            className={`pb-2 text-sm font-semibold transition ${tab === "SALES" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "المبيعات" : "Sales"}
          </button>
        )}
        {canInventory && (
          <button
            onClick={() => setTab("INVENTORY")}
            className={`pb-2 text-sm font-semibold transition ${tab === "INVENTORY" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "المخزون" : "Inventory"}
          </button>
        )}
        {canAccounting && (
          <button
            onClick={() => setTab("ACCOUNTING")}
            className={`pb-2 text-sm font-semibold transition ${tab === "ACCOUNTING" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "المحاسبة" : "Accounting"}
          </button>
        )}
        {canSales && (
          <button
            onClick={() => setTab("BY_SERVICE")}
            className={`pb-2 text-sm font-semibold transition ${tab === "BY_SERVICE" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "حسب الخدمة" : "By Service"}
          </button>
        )}
        {canAccounting && (
          <button
            onClick={() => setTab("AR_AGING")}
            className={`pb-2 text-sm font-semibold transition ${tab === "AR_AGING" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "أعمار الذمم المدينة" : "AR Aging"}
          </button>
        )}
        {canAccounting && (
          <button
            onClick={() => setTab("AP_AGING")}
            className={`pb-2 text-sm font-semibold transition ${tab === "AP_AGING" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "أعمار الذمم الدائنة" : "AP Aging"}
          </button>
        )}
        {canSales && (
          <button
            onClick={() => setTab("STAFF")}
            className={`pb-2 text-sm font-semibold transition ${tab === "STAFF" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "إنتاجية الموظفين" : "Staff"}
          </button>
        )}
        {canAccounting && (
          <button
            onClick={() => setTab("VAT")}
            className={`pb-2 text-sm font-semibold transition ${tab === "VAT" ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            {isAr ? "توزيع الضريبة" : "VAT"}
          </button>
        )}
      </div>

      {tab === "SALES" && canSales && <SalesReportTab isAr={isAr} t={t} />}
      {tab === "INVENTORY" && canInventory && <InventoryReportTab isAr={isAr} t={t} />}
      {tab === "ACCOUNTING" && canAccounting && <AccountingReportTab isAr={isAr} t={t} />}
      {tab === "BY_SERVICE" && canSales && <SalesByServiceReportTab isAr={isAr} t={t} />}
      {tab === "AR_AGING" && canAccounting && <ArAgingReportTab isAr={isAr} t={t} />}
      {tab === "AP_AGING" && canAccounting && <ApAgingReportTab isAr={isAr} t={t} />}
      {tab === "STAFF" && canSales && <StaffProductivityReportTab isAr={isAr} t={t} />}
      {tab === "VAT" && canAccounting && <VatBreakdownReportTab isAr={isAr} t={t} />}
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface SalesReportData {
  from: string;
  to: string;
  summary: { totalSales: string; totalTax: string; totalDiscount: string; invoiceCount: number; avgTicket: string };
  byDay: { date: string; total: string; count: number }[];
  byPaymentMethod: { paymentMethodId: string; nameEn: string; nameAr: string; total: string }[];
}

function SalesReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<"current" | "all">("current");

  const params = { from, to, businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "sales", params],
    queryFn: async () => (await api.get<ApiSuccess<SalesReportData>>("/reports/sales", { params })).data.data,
  });

  const maxDayTotal = Math.max(1, ...(data?.byDay.map((d) => Number(d.total)) ?? [0]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "من" : "From"}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "إلى" : "To"}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label={isAr ? "إجمالي المبيعات" : "Total Sales"} value={formatMoney(data.summary.totalSales, currency, locale)} />
            <StatCard label={isAr ? "الضريبة" : "Tax"} value={formatMoney(data.summary.totalTax, currency, locale)} />
            <StatCard label={isAr ? "الخصومات" : "Discounts"} value={formatMoney(data.summary.totalDiscount, currency, locale)} />
            <StatCard label={isAr ? "عدد الفواتير" : "Invoices"} value={String(data.summary.invoiceCount)} />
            <StatCard label={isAr ? "متوسط الفاتورة" : "Avg Ticket"} value={formatMoney(data.summary.avgTicket, currency, locale)} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{isAr ? "المبيعات اليومية" : "Sales by Day"}</h3>
            {data.byDay.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t("common.noResults")}</p>
            ) : (
              <div className="flex items-end gap-1.5 overflow-x-auto pb-2" style={{ minHeight: 140 }}>
                {data.byDay.map((d) => (
                  <div key={d.date} className="flex min-w-10 flex-col items-center gap-1">
                    <span className="ltr-nums text-[10px] text-slate-500">{formatMoney(d.total, currency, locale)}</span>
                    <div
                      className="w-6 rounded-t bg-sky-400"
                      style={{ height: `${Math.max(4, (Number(d.total) / maxDayTotal) * 100)}px` }}
                    />
                    <span className="ltr-nums text-[10px] text-slate-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{isAr ? "طريقة الدفع" : "Payment Method"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {data.byPaymentMethod.map((p) => (
                  <tr key={p.paymentMethodId} className="border-b border-slate-100">
                    <td className="px-4 py-2">{isAr ? p.nameAr : p.nameEn}</td>
                    <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(p.total, currency, locale)}</span></td>
                  </tr>
                ))}
                {data.byPaymentMethod.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface InventoryReportData {
  summary: { totalSkus: number; totalStockValue: string; lowStockCount: number };
  rows: {
    productId: string;
    nameEn: string;
    nameAr: string;
    sku: string;
    branchName: string;
    quantity: string;
    alertQuantity: string | null;
    isLowStock: boolean;
    stockValue: string;
  }[];
}

function InventoryReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [scope, setScope] = useState<"current" | "all">("current");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const params = { businessLocationId: scope === "current" ? currentLocationId : undefined, lowStockOnly: lowStockOnly ? "true" : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "inventory", params],
    queryFn: async () => (await api.get<ApiSuccess<InventoryReportData>>("/reports/inventory", { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} />
          {isAr ? "المخزون المنخفض فقط" : "Low stock only"}
        </label>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={isAr ? "عدد الأصناف" : "Total SKUs"} value={String(data.summary.totalSkus)} />
            <StatCard label={isAr ? "قيمة المخزون" : "Stock Value"} value={formatMoney(data.summary.totalStockValue, currency, locale)} />
            <StatCard label={isAr ? "مخزون منخفض" : "Low Stock"} value={String(data.summary.lowStockCount)} tone={data.summary.lowStockCount > 0 ? "warn" : "normal"} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">SKU</th>
                  <th className="px-4 py-2 text-start">{isAr ? "المنتج" : "Product"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الكمية" : "Qty"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "القيمة" : "Value"}</th>
                  <th className="px-4 py-2 text-start">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={`${r.productId}-${r.branchName}`} className="border-b border-slate-100">
                    <td className="px-4 py-2"><span className="ltr-nums">{r.sku}</span></td>
                    <td className="px-4 py-2">{isAr ? r.nameAr || r.nameEn : r.nameEn}</td>
                    <td className="px-4 py-2">{r.branchName}</td>
                    <td className="px-4 py-2"><span className="ltr-nums">{r.quantity}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.stockValue, currency, locale)}</span></td>
                    <td className="px-4 py-2">
                      {r.isLowStock ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{isAr ? "منخفض" : "Low"}</span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">{isAr ? "جيد" : "OK"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface AccountingReportData {
  from: string;
  to: string;
  summary: { grossRevenue: string; totalDiscount: string; netRevenue: string; vatCollected: string; totalInvoiced: string; invoiceCount: number };
  receivables: { total: string; customerCount: number };
  byMonth: { month: string; netRevenue: string; vat: string; count: number }[];
}

function AccountingReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [from, setFrom] = useState(daysAgoIso(89));
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<"current" | "all">("current");

  const params = { from, to, businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "accounting", params],
    queryFn: async () => (await api.get<ApiSuccess<AccountingReportData>>("/reports/accounting", { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "من" : "From"}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "إلى" : "To"}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label={isAr ? "الإيراد الإجمالي" : "Gross Revenue"} value={formatMoney(data.summary.grossRevenue, currency, locale)} />
            <StatCard label={isAr ? "الخصومات" : "Discounts"} value={formatMoney(data.summary.totalDiscount, currency, locale)} />
            <StatCard label={isAr ? "صافي الإيراد" : "Net Revenue"} value={formatMoney(data.summary.netRevenue, currency, locale)} />
            <StatCard label={isAr ? "ضريبة القيمة المضافة المحصّلة" : "VAT Collected"} value={formatMoney(data.summary.vatCollected, currency, locale)} />
            <StatCard label={isAr ? "إجمالي الفواتير" : "Total Invoiced"} value={formatMoney(data.summary.totalInvoiced, currency, locale)} />
            <StatCard
              label={isAr ? "الذمم المدينة" : "Receivables"}
              value={`${formatMoney(data.receivables.total, currency, locale)} (${data.receivables.customerCount})`}
              tone={Number(data.receivables.total) > 0 ? "warn" : "normal"}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{isAr ? "الشهر" : "Month"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "صافي الإيراد" : "Net Revenue"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "ضريبة القيمة المضافة" : "VAT"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الفواتير" : "Invoices"}</th>
                </tr>
              </thead>
              <tbody>
                {data.byMonth.map((m) => (
                  <tr key={m.month} className="border-b border-slate-100">
                    <td className="px-4 py-2"><span className="ltr-nums">{m.month}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(m.netRevenue, currency, locale)}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(m.vat, currency, locale)}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{m.count}</span></td>
                  </tr>
                ))}
                {data.byMonth.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface SalesByServiceData {
  from: string;
  to: string;
  summary: { totalRevenue: string; serviceCount: number };
  rows: { serviceId: string; nameEn: string; nameAr: string; categoryNameEn: string | null; categoryNameAr: string | null; quantity: string; subtotal: string; tax: string; total: string; count: number }[];
}

function SalesByServiceReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<"current" | "all">("current");
  const params = { from, to, businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "sales-by-service", params],
    queryFn: async () => (await api.get<ApiSuccess<SalesByServiceData>>("/reports/sales-by-service", { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "من" : "From"}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "إلى" : "To"}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={isAr ? "إجمالي الإيراد" : "Total Revenue"} value={formatMoney(data.summary.totalRevenue, currency, locale)} />
            <StatCard label={isAr ? "عدد الخدمات" : "Services"} value={String(data.summary.serviceCount)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{isAr ? "الخدمة" : "Service"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الفئة" : "Category"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الكمية" : "Qty"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "عدد العناصر" : "Lines"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.serviceId} className="border-b border-slate-100">
                    <td className="px-4 py-2">{isAr ? r.nameAr || r.nameEn : r.nameEn}</td>
                    <td className="px-4 py-2 text-slate-500">{(isAr ? r.categoryNameAr : r.categoryNameEn) ?? "-"}</td>
                    <td className="px-4 py-2"><span className="ltr-nums">{r.quantity}</span></td>
                    <td className="px-4 py-2 font-semibold"><span className="ltr-nums">{formatMoney(r.total, currency, locale)}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{r.count}</span></td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface AgingRow {
  buckets: Record<string, string>;
  total: string;
  nameEn: string;
  nameAr: string;
  phone: string;
}
interface AgingData {
  asOf: string;
  buckets: string[];
  bucketTotals: Record<string, string>;
  grandTotal: string;
  rows: AgingRow[];
}

function AgingReportTab({ isAr, t, endpoint, entityLabel }: { isAr: boolean; t: (k: string) => string; endpoint: string; entityLabel: string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const [scope, setScope] = useState<"current" | "all">("current");
  const params = { businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", endpoint, params],
    queryFn: async () => (await api.get<ApiSuccess<AgingData>>(`/reports/${endpoint}`, { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {data.buckets.map((b) => (
              <StatCard key={b} label={`${b} ${isAr ? "يوم" : "days"}`} value={formatMoney(data.bucketTotals[b], currency, locale)} tone={b === "90+" && Number(data.bucketTotals[b]) > 0 ? "warn" : "normal"} />
            ))}
            <StatCard label={isAr ? "الإجمالي" : "Grand Total"} value={formatMoney(data.grandTotal, currency, locale)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{entityLabel}</th>
                  {data.buckets.map((b) => (
                    <th key={b} className="px-4 py-2 text-start">
                      {b}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      {isAr ? r.nameAr || r.nameEn : r.nameEn} <span className="ltr-nums text-xs text-slate-400">{r.phone}</span>
                    </td>
                    {data.buckets.map((b) => (
                      <td key={b} className="px-4 py-2">
                        <span className="ltr-nums">{Number(r.buckets[b]) > 0 ? formatMoney(r.buckets[b], currency, locale) : "-"}</span>
                      </td>
                    ))}
                    <td className="px-4 py-2 font-semibold"><span className="ltr-nums">{formatMoney(r.total, currency, locale)}</span></td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.buckets.length + 2} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ArAgingReportTab(props: { isAr: boolean; t: (k: string) => string }) {
  return <AgingReportTab {...props} endpoint="ar-aging" entityLabel={props.isAr ? "العميل" : "Customer"} />;
}
function ApAgingReportTab(props: { isAr: boolean; t: (k: string) => string }) {
  return <AgingReportTab {...props} endpoint="ap-aging" entityLabel={props.isAr ? "المورد" : "Supplier"} />;
}

interface StaffProductivityData {
  from: string;
  to: string;
  rows: { userId: string; nameEn: string; nameAr: string; totalSales: string; invoiceCount: number; avgTicket: string }[];
}

function StaffProductivityReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<"current" | "all">("current");
  const params = { from, to, businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "staff-productivity", params],
    queryFn: async () => (await api.get<ApiSuccess<StaffProductivityData>>("/reports/staff-productivity", { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "من" : "From"}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "إلى" : "To"}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-start">{isAr ? "الموظف" : "Staff"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "إجمالي المبيعات" : "Total Sales"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "عدد الفواتير" : "Invoices"}</th>
                <th className="px-4 py-2 text-start">{isAr ? "متوسط الفاتورة" : "Avg Ticket"}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-slate-100">
                  <td className="px-4 py-2">{isAr ? r.nameAr || r.nameEn : r.nameEn}</td>
                  <td className="px-4 py-2 font-semibold"><span className="ltr-nums">{formatMoney(r.totalSales, currency, locale)}</span></td>
                  <td className="px-4 py-2"><span className="ltr-nums">{r.invoiceCount}</span></td>
                  <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.avgTicket, currency, locale)}</span></td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface VatBreakdownData {
  from: string;
  to: string;
  summary: { totalTax: string; totalTaxableBase: string };
  rows: { taxPercent: string; taxCategoryCode: string; subtotal: string; taxAmount: string; lineCount: number }[];
}

function VatBreakdownReportTab({ isAr, t }: { isAr: boolean; t: (k: string) => string }) {
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<"current" | "all">("current");
  const params = { from, to, businessLocationId: scope === "current" ? currentLocationId : undefined };

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "vat-breakdown", params],
    queryFn: async () => (await api.get<ApiSuccess<VatBreakdownData>>("/reports/vat-breakdown", { params })).data.data,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={isAr ? "من" : "From"}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "إلى" : "To"}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} />
        </Field>
        <Field label={isAr ? "الفرع" : "Branch"}>
          <select value={scope} onChange={(e) => setScope(e.target.value as "current" | "all")} className={inp}>
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
        </Field>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={isAr ? "إجمالي الضريبة" : "Total Tax"} value={formatMoney(data.summary.totalTax, currency, locale)} />
            <StatCard label={isAr ? "الوعاء الضريبي" : "Taxable Base"} value={formatMoney(data.summary.totalTaxableBase, currency, locale)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{isAr ? "النسبة" : "Rate"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "فئة الضريبة" : "Category"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الوعاء الضريبي" : "Taxable Base"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الضريبة" : "Tax"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "عدد العناصر" : "Lines"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-4 py-2"><span className="ltr-nums">{r.taxPercent}%</span></td>
                    <td className="px-4 py-2">{r.taxCategoryCode}</td>
                    <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.subtotal, currency, locale)}</span></td>
                    <td className="px-4 py-2 font-semibold"><span className="ltr-nums">{formatMoney(r.taxAmount, currency, locale)}</span></td>
                    <td className="px-4 py-2"><span className="ltr-nums">{r.lineCount}</span></td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {t("common.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "warn" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`ltr-nums mt-1 text-lg font-semibold ${tone === "warn" ? "text-red-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inp = "rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none";
