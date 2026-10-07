import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { MultiSelectDropdown } from "../../components/ui/MultiSelectDropdown";
import { errorMessage } from "../paymentAccounts/shared";
import {
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  exportAmount,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

type ShippingStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";
const SHIPPING_LABELS: Record<ShippingStatus, { en: string; ar: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ" },
  READY: { en: "Ready", ar: "جاهز" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم" },
  CANCELLED: { en: "Cancelled", ar: "ملغى" },
};

type AmountKey = "totalItems" | "beforeTax" | "discount" | "tax" | "extraServices" | "total" | "returned" | "remaining";
type MethodAmount = Named & { amount: string };

interface Row extends Record<AmountKey, string> {
  id: string;
  date: string;
  barcode: string | null;
  invoiceNo: string | null;
  paymentMethods: MethodAmount[];
  createdBy: { fullNameEn: string; fullNameAr: string | null };
  productsEn: string;
  productsAr: string;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters & { shippingStatuses: ShippingStatus[] | null };
  rows: Row[];
  totals: Record<AmountKey, string> & { paymentMethods: MethodAmount[] };
}
interface Filters extends BaseReportFilters {
  shippingStatuses: string[];
}

const params = (f: Filters) => ({ ...baseFilterParams(f), ...(f.shippingStatuses.length ? { shippingStatuses: f.shippingStatuses.join(",") } : {}) });

function PaymentMethodsCell({ methods, isAr }: { methods: MethodAmount[]; isAr: boolean }) {
  return (
    <>
      {methods.map((m) => (
        <div key={m.nameEn} className="whitespace-nowrap">
          <span className="font-semibold">{pickName(m, isAr)}</span>: {num(m.amount)}
        </div>
      ))}
    </>
  );
}

/** Reference: Reports > Sales Report (report/sales-report.blade.php). */
export default function SalesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), shippingStatuses: [] });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "sales-report", params(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/sales-report", { params: params(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const methodsText = (list: MethodAmount[]) => list.map((m) => `${pickName(m, isAr)}: ${exportAmount(m.amount)}`).join(" / ");
  const userName = (r: Row) => (isAr ? r.createdBy.fullNameAr || r.createdBy.fullNameEn : r.createdBy.fullNameEn);
  const t = report?.totals;
  const columns: ReportColumn<Row>[] = [
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    { key: "barcode", label: isAr ? "الباركود" : "Barcode", render: (r) => <span className="ltr-nums whitespace-nowrap font-medium text-slate-800">{r.barcode ?? "-"}</span>, exportValue: (r) => r.barcode },
    { key: "invoiceNo", label: isAr ? "رقم الفاتورة" : "Invoice No.", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.invoiceNo ?? "-"}</span>, exportValue: (r) => r.invoiceNo },
    amountColumn("totalItems", isAr ? "مجموع العناصر" : "Total Items", (r) => r.totalItems, t?.totalItems),
    amountColumn("beforeTax", isAr ? "الاجمالى قبل الضريبة" : "Total Before Tax", (r) => r.beforeTax, t?.beforeTax),
    amountColumn("discount", isAr ? "الخصم" : "Discount", (r) => r.discount, t?.discount),
    amountColumn("tax", isAr ? "الضريبة" : "Tax", (r) => r.tax, t?.tax),
    amountColumn("extraServices", isAr ? "خدمات اضافيه" : "Extra Services", (r) => r.extraServices, t?.extraServices),
    amountColumn("total", isAr ? "المجموع" : "Total", (r) => r.total, t?.total),
    {
      key: "methods",
      label: isAr ? "طرق الدفع" : "Payment Methods",
      render: (r) => <PaymentMethodsCell methods={r.paymentMethods} isAr={isAr} />,
      exportValue: (r) => methodsText(r.paymentMethods),
      ...(t ? { total: { render: <PaymentMethodsCell methods={t.paymentMethods} isAr={isAr} />, exportValue: methodsText(t.paymentMethods) } } : {}),
    },
    amountColumn("returned", isAr ? "تم ارجاعها" : "Returned", (r) => r.returned, t?.returned),
    amountColumn("remaining", isAr ? "المتبقى" : "Total remaining", (r) => r.remaining, t?.remaining),
    { key: "createdBy", label: isAr ? "انشأ من قبل" : "Created By", render: userName, exportValue: userName },
    {
      key: "products",
      label: isAr ? "المنتجات" : "Products",
      render: (r) => <span className="block min-w-[14rem]">{isAr ? r.productsAr : r.productsEn}</span>,
      exportValue: (r) => (isAr ? r.productsAr : r.productsEn),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير المبيعات" : "Sales Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="sales-report"
        title={`${isAr ? "تقرير المبيعات" : "Sales Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.shippingStatuses.length ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
            <FilterField label={isAr ? "الحالة" : "Status"}>
              <MultiSelectDropdown
                options={(Object.keys(SHIPPING_LABELS) as ShippingStatus[]).map((s) => ({ value: s, label: SHIPPING_LABELS[s][isAr ? "ar" : "en"] }))}
                value={filters.shippingStatuses}
                onChange={(shippingStatuses) => setFilters({ ...filters, shippingStatuses })}
                placeholder={isAr ? "الكل" : "All"}
                isAr={isAr}
                inline
              />
            </FilterField>
          </>
        }
      />
    </div>
  );
}
