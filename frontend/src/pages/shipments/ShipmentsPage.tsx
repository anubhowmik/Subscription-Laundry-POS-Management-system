import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useCustomers } from "../../api/posApi";
import { formatDate } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { inputClass, selectClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";
import { Truck, Eye } from "lucide-react";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
type ShippingStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "success" | "warning" | "danger" | "info"> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "danger",
  OVERPAID: "info",
};

// Same 5-stage vocabulary as OrdersPage.tsx's fulfillment board - see sale.service.ts's
// computeShippingStatus for why this reuses that instead of the reference's own separate (and
// much larger) shipping_status enum.
const SHIPPING_STATUS_LABEL: Record<ShippingStatus, { en: string; ar: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ" },
  READY: { en: "Ready", ar: "جاهز" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم" },
  CANCELLED: { en: "Cancelled", ar: "ملغى" },
};
const SHIPPING_STATUS_VARIANT: Record<ShippingStatus, "neutral" | "warning" | "info" | "success" | "danger"> = {
  PENDING: "neutral",
  IN_PROGRESS: "warning",
  READY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};

interface ShipmentRow {
  id: string;
  saleDate: string;
  invoiceNumber: string | null;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  customer: { nameEn: string; nameAr: string | null; phone: string };
  businessLocation: { branchName: string };
}

/**
 * Reference's own "Shipments" list (SellController@shipments + sell/shipments.blade.php) - every
 * finalized sale, filterable by shipping status alongside the usual location/customer/date/user/
 * payment-status filters. A per-invoice list, distinct from OrdersPage's per-item Kanban board -
 * this answers "which whole orders are stuck at which stage", that answers "what do I personally
 * need to move next."
 */
export default function ShipmentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const { locations } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"" | PaymentStatus>("");
  const [shippingStatus, setShippingStatus] = useState<"" | ShippingStatus>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; nameEn: string; nameAr: string | null } | null>(null);
  const activeFilterCount =
    (businessLocationId ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (createdBy ? 1 : 0) +
    (paymentStatus ? 1 : 0) +
    (shippingStatus ? 1 : 0) +
    (pickedCustomer ? 1 : 0);
  function clearAllFilters() {
    setBusinessLocationId("");
    setFromDate("");
    setToDate("");
    setCreatedBy("");
    setPaymentStatus("");
    setShippingStatus("");
    setCustomerSearch("");
    setPickedCustomer(null);
    setPage(1);
  }
  const { data: staffUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });
  const { data: customerResults } = useCustomers(customerSearch);

  const columns: { key: string; label: string; render: (r: ShipmentRow) => ReactNode; exportValue: (r: ShipmentRow) => string | number | null }[] = [
    {
      key: "saleDate",
      label: isAr ? "التاريخ" : "Date",
      render: (r) => <span className="ltr-nums">{formatDate(r.saleDate, isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (r) => formatDate(r.saleDate, isAr ? "ar-SA" : "en-US"),
    },
    { key: "invoiceNumber", label: isAr ? "الفاتورة" : "Invoice", render: (r) => <span className="ltr-nums">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    {
      key: "customerName",
      label: isAr ? "العميل" : "Customer",
      render: (r) => (isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn),
      exportValue: (r) => (isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn),
    },
    { key: "phone", label: isAr ? "رقم الجوال" : "Contact No.", render: (r) => <span className="ltr-nums">{r.customer.phone}</span>, exportValue: (r) => r.customer.phone },
    { key: "location", label: isAr ? "الفرع" : "Location", render: (r) => r.businessLocation.branchName, exportValue: (r) => r.businessLocation.branchName },
    {
      key: "shippingStatus",
      label: isAr ? "حالة الشحن" : "Shipping Status",
      render: (r) => <Badge variant={SHIPPING_STATUS_VARIANT[r.shippingStatus]}>{isAr ? SHIPPING_STATUS_LABEL[r.shippingStatus].ar : SHIPPING_STATUS_LABEL[r.shippingStatus].en}</Badge>,
      exportValue: (r) => r.shippingStatus,
    },
    {
      key: "paymentStatus",
      label: isAr ? "حالة الدفع" : "Payment Status",
      render: (r) => <Badge variant={PAYMENT_STATUS_VARIANT[r.paymentStatus]}>{r.paymentStatus}</Badge>,
      exportValue: (r) => r.paymentStatus,
    },
  ];

  const columnVisibility = useColumnVisibility(
    "shipments",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  const filterParams = {
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(shippingStatus ? { shippingStatus } : {}),
    ...(pickedCustomer ? { customerId: pickedCustomer.id } : {}),
  };

  const { data } = useQuery({
    queryKey: ["shipments", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ShipmentRow[]>>("/sales/shipments", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "الشحنات" : "Shipments"} />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard icon={Truck} cardBg="bg-indigo-500" iconBg="bg-white/20" iconColor="text-white" highlight label={isAr ? "الشحنات" : "Shipments"} value={String(data.meta.total)} />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Business Location"}</label>
              <select
                value={businessLocationId}
                onChange={(e) => {
                  setBusinessLocationId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "العميل" : "Customer"}</label>
              <input
                value={pickedCustomer ? (isAr ? pickedCustomer.nameAr || pickedCustomer.nameEn : pickedCustomer.nameEn) : customerSearch}
                onChange={(e) => {
                  setPickedCustomer(null);
                  setCustomerSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={isAr ? "أي عميل" : "Any customer"}
                className={cn(inputClass, "w-full")}
              />
              {customerSearch && !pickedCustomer && (customerResults?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {customerResults!.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPickedCustomer(c);
                        setCustomerSearch("");
                        setPage(1);
                      }}
                      className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                    >
                      {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المستخدم" : "User"}</label>
              <select
                value={createdBy}
                onChange={(e) => {
                  setCreatedBy(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(staffUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullNameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الدفع" : "Payment Status"}</label>
              <select
                value={paymentStatus}
                onChange={(e) => {
                  setPaymentStatus(e.target.value as typeof paymentStatus);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="PAID">{isAr ? "مدفوع" : "Paid"}</option>
                <option value="PARTIAL">{isAr ? "مدفوع جزئيًا" : "Partial"}</option>
                <option value="DUE">{isAr ? "مستحق" : "Due"}</option>
                <option value="OVERPAID">{isAr ? "مدفوع زيادة" : "Overpaid"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الشحن" : "Shipping Status"}</label>
              <select
                value={shippingStatus}
                onChange={(e) => {
                  setShippingStatus(e.target.value as typeof shippingStatus);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(Object.keys(SHIPPING_STATUS_LABEL) as ShippingStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {isAr ? SHIPPING_STATUS_LABEL[s].ar : SHIPPING_STATUS_LABEL[s].en}
                  </option>
                ))}
              </select>
            </div>
          </FiltersMenu>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "الشحنات" : "Shipments"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<ShipmentRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<ShipmentRow[]>>("/sales/shipments", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(r)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {visibleColumns.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(r)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} variant="default" onClick={() => setViewingSaleId(r.id)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}

      {viewingSaleId && <SaleDetailModal saleId={viewingSaleId} onClose={() => setViewingSaleId(null)} />}
    </div>
  );
}
