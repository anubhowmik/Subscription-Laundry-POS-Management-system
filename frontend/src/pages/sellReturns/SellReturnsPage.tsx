import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods, useCustomers } from "../../api/posApi";
import { formatMoney, formatDate } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { inputClass, selectClass, labelClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";
import { Undo2, Ban, Eye, Pencil, Printer, Wallet } from "lucide-react";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERPAID";

const STATUS_VARIANT: Record<PaymentStatus, "success" | "warning" | "danger" | "info"> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "danger",
  OVERPAID: "info",
};

// Matches the reference's own reason list exactly (sell_return/add.blade.php) - no "Other".
type Reason = "NOT_WASHABLE" | "DAMAGED" | "NOT_FOUND";

const REASON_LABEL: Record<Reason, { en: string; ar: string }> = {
  NOT_WASHABLE: { en: "Not Washable", ar: "غير قابل للغسيل" },
  DAMAGED: { en: "Damaged", ar: "تالف" },
  NOT_FOUND: { en: "Not Found", ar: "غير موجود" },
};

interface SellReturnRow {
  id: string;
  creditNoteNumber: string | null;
  returnDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  paymentStatus: PaymentStatus;
  sale: { id: string; invoiceNumber: string };
  customer: { nameEn: string; nameAr: string | null };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; reason: Reason; saleItem: { descriptionEn: string; descriptionAr: string | null } }[];
}

export default function SellReturnsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Backend already whitelists these fields (sellReturn.service.ts's SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Filters converted from the reference's own sell_return/index.blade.php: Business Location,
  // Customer, Date Range, Created By, Payment Status, Returned Reason. Location Group and Machine
  // are deliberately NOT built - see sellReturn.service.ts list()'s matching comment.
  const { locations } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"" | PaymentStatus>("");
  const [reason, setReason] = useState<"" | Reason>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; nameEn: string; nameAr: string | null } | null>(null);
  const activeFilterCount =
    (businessLocationId ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (createdBy ? 1 : 0) +
    (paymentStatus ? 1 : 0) +
    (reason ? 1 : 0) +
    (pickedCustomer ? 1 : 0);
  function clearAllFilters() {
    setBusinessLocationId("");
    setFromDate("");
    setToDate("");
    setCreatedBy("");
    setPaymentStatus("");
    setReason("");
    setCustomerSearch("");
    setPickedCustomer(null);
    setPage(1);
  }
  const { data: staffUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });
  const { data: customerResults } = useCustomers(customerSearch);

  const columns: { key: string; label: string; sortField?: string; render: (r: SellReturnRow) => ReactNode; exportValue: (r: SellReturnRow) => string | number | null }[] = [
    {
      key: "returnDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "returnDate",
      render: (r) => <span className="ltr-nums">{new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (r) => new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    { key: "creditNoteNumber", label: isAr ? "إشعار دائن" : "Credit Note", render: (r) => <span className="ltr-nums">{r.creditNoteNumber ?? "-"}</span>, exportValue: (r) => r.creditNoteNumber },
    {
      // Reference's own list makes the parent invoice a clickable link that opens the original
      // sale's view modal (SellController@show) - not just plain text.
      key: "invoiceNumber",
      label: isAr ? "الفاتورة" : "Invoice",
      render: (r) => (
        <button type="button" onClick={() => setViewingSaleId(r.sale.id)} className="ltr-nums text-indigo-600 hover:underline">
          {r.sale.invoiceNumber}
        </button>
      ),
      exportValue: (r) => r.sale.invoiceNumber,
    },
    {
      key: "customerName",
      label: isAr ? "العميل" : "Customer",
      render: (r) => (isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn),
      exportValue: (r) => (isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn),
    },
    {
      key: "location",
      label: isAr ? "الفرع" : "Location",
      render: (r) => r.businessLocation.branchName,
      exportValue: (r) => r.businessLocation.branchName,
    },
    {
      key: "items",
      label: isAr ? "الأصناف" : "Items",
      render: (r) => (
        <>
          {r.items.map((item) => (
            <div key={item.id} className="text-xs text-slate-600">
              {isAr ? item.saleItem.descriptionAr || item.saleItem.descriptionEn : item.saleItem.descriptionEn}
              <span className="ltr-nums text-slate-400"> × {item.quantity}</span> —{" "}
              <span className="text-slate-400">{isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en}</span>
            </div>
          ))}
        </>
      ),
      exportValue: (r) =>
        r.items
          .map(
            (item) =>
              `${isAr ? item.saleItem.descriptionAr || item.saleItem.descriptionEn : item.saleItem.descriptionEn} x${item.quantity} (${isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en})`,
          )
          .join("; "),
    },
    {
      key: "paymentStatus",
      label: isAr ? "حالة الدفع" : "Payment Status",
      render: (r) => <Badge variant={STATUS_VARIANT[r.paymentStatus]}>{r.paymentStatus}</Badge>,
      exportValue: (r) => r.paymentStatus,
    },
    { key: "totalAmount", label: isAr ? "الإجمالي" : "Total", sortField: "totalAmount", render: (r) => <span className="ltr-nums">{formatMoney(r.totalAmount, currency, locale)}</span>, exportValue: (r) => Number(r.totalAmount) },
    { key: "refundedAmount", label: isAr ? "المسترد" : "Refunded", sortField: "refundedAmount", render: (r) => <span className="ltr-nums">{formatMoney(r.refundedAmount, currency, locale)}</span>, exportValue: (r) => Number(r.refundedAmount) },
    {
      // Reference's own "Payment Due" - what the store still owes the customer for this return.
      key: "due",
      label: isAr ? "المتبقي" : "Due",
      render: (r) => <span className="ltr-nums">{formatMoney(Math.max(0, Number(r.totalAmount) - Number(r.refundedAmount)), currency, locale)}</span>,
      exportValue: (r) => Math.max(0, Number(r.totalAmount) - Number(r.refundedAmount)),
    },
    { key: "createdBy", label: isAr ? "بواسطة" : "By", render: (r) => r.createdByUser.fullNameEn, exportValue: (r) => r.createdByUser.fullNameEn },
  ];

  const columnVisibility = useColumnVisibility(
    "sell-returns",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    sortBy,
    sortOrder,
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(reason ? { reason } : {}),
    ...(pickedCustomer ? { customerId: pickedCustomer.id } : {}),
  };

  const { data } = useQuery({
    queryKey: ["sell-returns", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<SellReturnRow[]>>("/sell-returns", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/sell-returns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sell-returns"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "مرتجعات المبيعات" : "Sales Returns"}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ {isAr ? "مرتجع جديد" : "New Return"}</Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Undo2}
            cardBg="bg-rose-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "مرتجعات المبيعات" : "Sales Returns"}
            value={String(data.meta.total)}
          />
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
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "السبب" : "Reason"}</label>
              <select
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as typeof reason);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
                  <option key={r} value={r}>
                    {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
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
              title={isAr ? "مرتجعات المبيعات" : "Sales Returns"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<SellReturnRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<SellReturnRow[]>>("/sell-returns", { params: { ...filterParams, page: p, limit: l } });
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
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
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
                    <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} variant="default" onClick={() => setViewingId(r.id)} />
                    <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} variant="default" onClick={() => setEditingId(r.id)} />
                    <RowActionButton
                      icon={Printer}
                      label={isAr ? "طباعة" : "Print"}
                      variant="default"
                      onClick={() => window.open(`/sell-returns/${r.id}/print`, "_blank")}
                    />
                    <RowActionButton icon={Wallet} label={isAr ? "الدفعات" : "Payments"} variant="default" onClick={() => setPayingId(r.id)} />
                    <RowActionButton
                      icon={Ban}
                      label={isAr ? "إلغاء" : "Void"}
                      variant="danger"
                      onClick={async () => {
                        if (
                          await confirmAction({
                            message: isAr ? "هل تريد إلغاء هذا المرتجع؟ سيتم عكس المخزون والرصيد." : "Void this return? Stock and balance will be reversed.",
                            danger: true,
                          })
                        ) {
                          voidMutation.mutate(r.id);
                        }
                      }}
                    />
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

      {formOpen && (
        <ReturnFormModal
          isAr={isAr}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["sell-returns"] });
            setFormOpen(false);
          }}
        />
      )}

      {editingId && (
        <ReturnFormModal
          isAr={isAr}
          editingId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["sell-returns"] });
            // Also drop the cached detail (shared with View and Payments) - it holds the
            // pre-edit totalAmount/items and would otherwise leak stale figures into whichever
            // of those modals opens next.
            qc.invalidateQueries({ queryKey: ["sell-return-detail", editingId] });
            setEditingId(null);
          }}
        />
      )}

      {viewingId && <SellReturnDetailModal id={viewingId} isAr={isAr} currency={currency} locale={locale} onClose={() => setViewingId(null)} />}

      {payingId && <SellReturnPaymentsModal id={payingId} isAr={isAr} currency={currency} locale={locale} onClose={() => setPayingId(null)} />}

      {viewingSaleId && <SaleDetailModal saleId={viewingSaleId} onClose={() => setViewingSaleId(null)} />}
    </div>
  );
}

interface SellReturnDetail {
  id: string;
  creditNoteNumber: string | null;
  returnDate: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  paymentStatus: PaymentStatus;
  notes: string | null;
  sale: { id: string; invoiceNumber: string; saleDate: string };
  customer: { nameEn: string; nameAr: string | null; phone: string };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: {
    id: string;
    saleItemId: string;
    quantity: string;
    unitPrice: string;
    taxAmount: string;
    total: string;
    reason: Reason;
    note: string | null;
    saleItem: { descriptionEn: string; descriptionAr: string | null };
  }[];
  refundPayments: { id: string; amount: string; paymentMethod: { nameEn: string; nameAr: string } }[];
}

/** Reference's own "View" modal (`sell_return/show.blade.php`) - "Sell Return Details" +
 * "Sale Details" side by side, then the returned line items and totals. Adapted to this app's own
 * shape: the refund (if any cash was actually handed back, vs. left as store credit) is read off
 * the real Payment row create() wrote, matching how the reference reads its own payment info. */
function SellReturnDetailModal({
  id,
  isAr,
  currency,
  locale,
  onClose,
}: {
  id: string;
  isAr: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["sell-return-detail", id],
    queryFn: async () => (await api.get<ApiSuccess<SellReturnDetail>>(`/sell-returns/${id}`)).data.data,
  });

  return (
    <Modal
      title={
        <>
          {isAr ? "مرتجع مبيعات" : "Sell Return"} <span className="ltr-nums">{data?.creditNoteNumber ?? "…"}</span>
        </>
      }
      subtitle={data ? (isAr ? "فاتورة" : "Invoice") + " " + data.sale.invoiceNumber : undefined}
      onClose={onClose}
      size="lg"
    >
      {isLoading && <p className="py-8 text-center text-sm text-slate-400">{isAr ? "جارٍ التحميل" : "Loading"}</p>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{isAr ? "تفاصيل المرتجع" : "Return Details"}</p>
              <p className="ltr-nums">{formatDate(data.returnDate, locale)}</p>
              <p>{isAr ? data.customer.nameAr || data.customer.nameEn : data.customer.nameEn}</p>
              <p className="text-slate-500">{data.businessLocation.branchName}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{isAr ? "تفاصيل الفاتورة" : "Sale Details"}</p>
              <p className="ltr-nums">{data.sale.invoiceNumber}</p>
              <p className="ltr-nums text-slate-500">{formatDate(data.sale.saleDate, locale)}</p>
              {data.refundPayments.length > 0 && (
                <p className="text-slate-500">
                  {isAr ? "استرداد عبر" : "Refunded via"}:{" "}
                  {data.refundPayments.map((p) => (isAr ? p.paymentMethod.nameAr : p.paymentMethod.nameEn)).join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{isAr ? item.saleItem.descriptionAr || item.saleItem.descriptionEn : item.saleItem.descriptionEn}</p>
                  <p className="ltr-nums text-xs text-slate-400">
                    {item.quantity} × {formatMoney(item.unitPrice, currency, locale)} = {formatMoney(item.total, currency, locale)}
                    {" — "}
                    <span>{isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en}</span>
                  </p>
                  {item.note && <p className="text-xs text-slate-400">{item.note}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="ms-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? "الإجمالي الفرعي" : "Subtotal"}</span>
              <span className="ltr-nums">{formatMoney(data.subtotal, currency, locale)}</span>
            </div>
            {Number(data.discountAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? "الخصم" : "Discount"}</span>
                <span className="ltr-nums">-{formatMoney(data.discountAmount, currency, locale)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? "الضريبة" : "Tax"}</span>
              <span className="ltr-nums">{formatMoney(data.taxAmount, currency, locale)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <span>{isAr ? "الإجمالي" : "Total"}</span>
              <span className="ltr-nums">{formatMoney(data.totalAmount, currency, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? "المسترد" : "Refunded"}</span>
              <span className="ltr-nums">{formatMoney(data.refundedAmount, currency, locale)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{isAr ? "الحالة" : "Status"}</span>
              <Badge variant={STATUS_VARIANT[data.paymentStatus]}>{data.paymentStatus}</Badge>
            </div>
          </div>

          {data.notes && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{data.notes}</p>}
          <p className="text-xs text-slate-400">{isAr ? "أضيف بواسطة" : "Added by"} {data.createdByUser.fullNameEn}</p>
        </div>
      )}
    </Modal>
  );
}

interface SalePick {
  id: string;
  invoiceNumber: string;
}

interface ReturnableSale {
  id: string;
  invoiceNumber: string;
  customer: { nameEn: string; nameAr: string | null };
  items: {
    id: string;
    descriptionEn: string;
    descriptionAr: string | null;
    quantity: string;
    unitPrice: string;
    taxPercent: string;
    alreadyReturned: string;
    remaining: string;
  }[];
}

interface SelectedLine {
  saleItemId: string;
  quantity: number;
  reason: Reason;
  note?: string;
}

/** Reference's own return-level discount_type/discount_amount (sell_return/add.blade.php) plus a
 * live Return Subtotal/Discount/Tax/Total preview the reference computes client-side as quantities
 * are checked - both were missing from the original build of this modal, which just asked for a
 * blind "Cash Refunded" number with no computed total to check it against. In edit mode
 * (`editingId` set - reference's own SellReturnController@add reopening an existing return) the
 * payment/refund fields are hidden entirely: editing only ever changes item scope here, never the
 * refund, which is its own dedicated "Payments" action (see SellReturnPaymentsModal below). */
function ReturnFormModal({
  isAr,
  editingId,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editingId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: paymentMethods } = usePaymentMethods();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SalePick[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, SelectedLine>>({});
  const [linesInitialized, setLinesInitialized] = useState(false);
  const [discountMode, setDiscountMode] = useState<"FIXED" | "PERCENT">("FIXED");
  const [discountValue, setDiscountValue] = useState("");
  const [refundedAmount, setRefundedAmount] = useState("");
  const [refundedAmountTouched, setRefundedAmountTouched] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ["sell-return-detail", editingId],
    queryFn: async () => (await api.get<ApiSuccess<SellReturnDetail>>(`/sell-returns/${editingId}`)).data.data,
    enabled: Boolean(editingId),
  });

  if (existing && !linesInitialized) {
    setSaleId(existing.sale.id);
    setNotes(existing.notes ?? "");
    const prefill: Record<string, SelectedLine> = {};
    for (const item of existing.items) {
      prefill[item.saleItemId] = { saleItemId: item.saleItemId, quantity: Number(item.quantity), reason: item.reason, note: item.note ?? undefined };
    }
    setLines(prefill);
    // The stored discountAmount is the resulting figure, not the fixed/percentage mode that
    // produced it (see SellReturn.discountAmount's schema comment) - re-expressed as an
    // equivalent Fixed value so editing doesn't silently drop it.
    if (Number(existing.discountAmount) > 0) {
      setDiscountMode("FIXED");
      setDiscountValue(existing.discountAmount);
    }
    setLinesInitialized(true);
  }

  const { data: sale } = useQuery({
    queryKey: ["returnable-sale", saleId, editingId],
    queryFn: async () =>
      (await api.get<ApiSuccess<ReturnableSale>>(`/sell-returns/sale/${saleId}`, { params: editingId ? { excludeSellReturnId: editingId } : undefined })).data.data,
    enabled: Boolean(saleId),
  });

  async function runSearch(value: string) {
    setSearch(value);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<SalePick[]>>("/sales", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  function toggleLine(itemId: string, remaining: number) {
    setLines((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = { saleItemId: itemId, quantity: remaining, reason: "DAMAGED" };
      return next;
    });
  }

  function updateLine(itemId: string, patch: Partial<SelectedLine>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  // Live preview only - the backend recomputes and persists the authoritative figures the same
  // way (see sellReturn.service.ts's priceReturnLines), this just mirrors that formula so the user
  // sees a real number instead of guessing one.
  const priced = Object.values(lines).map((l) => {
    const item = sale?.items.find((i) => i.id === l.saleItemId);
    const unitPrice = Number(item?.unitPrice ?? 0);
    const taxPercent = Number(item?.taxPercent ?? 0);
    return { rawSubtotal: unitPrice * l.quantity, taxPercent };
  });
  const lineSubtotal = priced.reduce((sum, l) => sum + l.rawSubtotal, 0);
  const discountPreview = discountValue
    ? Math.min(discountMode === "PERCENT" ? (lineSubtotal * Number(discountValue)) / 100 : Number(discountValue), lineSubtotal)
    : 0;
  const discountRatio = lineSubtotal > 0 ? (lineSubtotal - discountPreview) / lineSubtotal : 1;
  const subtotalPreview = priced.reduce((sum, l) => sum + l.rawSubtotal * discountRatio, 0);
  const taxPreview = priced.reduce((sum, l) => sum + l.rawSubtotal * discountRatio * (l.taxPercent / 100), 0);
  const totalPreview = subtotalPreview + taxPreview;

  if (!editingId && !refundedAmountTouched && totalPreview > 0 && refundedAmount !== totalPreview.toFixed(2)) {
    setRefundedAmount(totalPreview.toFixed(2));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const items = Object.values(lines).map((l) => ({ saleItemId: l.saleItemId, quantity: l.quantity, reason: l.reason, note: l.note || undefined }));
      const discountFields = discountValue ? { discountMode, discountValue: Number(discountValue) } : {};
      if (editingId) {
        return api.put(`/sell-returns/${editingId}`, { items, ...discountFields, notes: notes || undefined });
      }
      return api.post("/sell-returns", {
        saleId,
        items,
        ...discountFields,
        refundedAmount: refundedAmount ? Number(refundedAmount) : undefined,
        paymentMethodId: paymentMethodId || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(saleId) && Object.keys(lines).length > 0 && Object.values(lines).every((l) => l.quantity > 0);

  return (
    <Modal
      title={editingId ? (isAr ? "تعديل المرتجع" : "Edit Sales Return") : isAr ? "مرتجع جديد" : "New Sales Return"}
      onClose={onClose}
      size="lg"
      footer={
        sale ? (
          <Button
            fullWidth
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? "…" : editingId ? (isAr ? "حفظ التغييرات" : "Save Changes") : isAr ? "تقديم المرتجع" : "Submit Return"}
          </Button>
        ) : undefined
      }
    >
      {!editingId && !saleId && (
        <div className="relative">
          <label className={labelClass}>{isAr ? "رقم الفاتورة" : "Invoice"}</label>
          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث برقم الفاتورة" : "Search by invoice number"}
            className={inputClass}
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSaleId(s.id);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {s.invoiceNumber}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sale && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {sale.invoiceNumber} — {isAr ? sale.customer.nameAr || sale.customer.nameEn : sale.customer.nameEn}
          </p>

          <div className="space-y-2">
            {sale.items.map((item) => {
              const remaining = Number(item.remaining);
              const selected = lines[item.id];
              return (
                <div key={item.id} className={`rounded-lg border p-2.5 ${remaining <= 0 && !selected ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200"}`}>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      disabled={remaining <= 0 && !selected}
                      checked={Boolean(selected)}
                      onChange={() => toggleLine(item.id, remaining)}
                    />
                    {isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}
                    <span className="ltr-nums text-xs text-slate-400">
                      ({isAr ? "المتبقي" : "remaining"}: {item.remaining} / {item.quantity})
                    </span>
                  </label>
                  {selected && (
                    <div className="mt-2 grid grid-cols-3 gap-2 ps-6">
                      <input
                        type="number"
                        min={0.01}
                        max={remaining}
                        step="0.01"
                        value={selected.quantity}
                        onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })}
                        className={inputClass}
                      />
                      <select value={selected.reason} onChange={(e) => updateLine(item.id, { reason: e.target.value as Reason })} className={selectClass}>
                        {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
                          <option key={r} value={r}>
                            {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
                          </option>
                        ))}
                      </select>
                      <input
                        value={selected.note ?? ""}
                        onChange={(e) => updateLine(item.id, { note: e.target.value })}
                        placeholder={isAr ? "ملاحظة" : "Note"}
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "نوع الخصم" : "Discount Type"}</label>
              <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as "FIXED" | "PERCENT")} className={selectClass}>
                <option value="FIXED">{isAr ? "مبلغ ثابت" : "Fixed"}</option>
                <option value="PERCENT">{isAr ? "نسبة مئوية" : "Percentage"}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "قيمة الخصم" : "Discount Amount"}</label>
              <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" className={inputClass} />
            </div>
          </div>

          <div className="w-56 ms-auto space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? "الإجمالي الفرعي" : "Return Subtotal"}</span>
              <span className="ltr-nums">{lineSubtotal.toFixed(2)}</span>
            </div>
            {discountPreview > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? "الخصم" : "Discount"}</span>
                <span className="ltr-nums">-{discountPreview.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">{isAr ? "الضريبة" : "Tax"}</span>
              <span className="ltr-nums">{taxPreview.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <span>{isAr ? "الإجمالي" : "Return Total"}</span>
              <span className="ltr-nums">{totalPreview.toFixed(2)}</span>
            </div>
          </div>

          {!editingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "المبلغ المسترد نقدًا" : "Cash Refunded"}</label>
                <input
                  type="number"
                  min={0}
                  value={refundedAmount}
                  onChange={(e) => {
                    setRefundedAmountTouched(true);
                    setRefundedAmount(e.target.value);
                  }}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "طريقة الدفع" : "Payment Method"}</label>
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className={selectClass}>
                  <option value="">{isAr ? "بلا (رصيد للعميل)" : "None (store credit)"}</option>
                  {paymentMethods?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isAr ? m.nameAr : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}

/** Reference's "View Payments" + "Add Payment" row actions (only shown there while
 * payment_status != paid), combined into one modal - the same design-consolidation judgment
 * SalePaymentsModal (SalesPage.tsx) already applied to Sale's identical pair of reference actions. */
function SellReturnPaymentsModal({ id, isAr, currency, locale, onClose }: { id: string; isAr: boolean; currency: string; locale: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: paymentMethods } = usePaymentMethods();

  const { data: sellReturn, isLoading } = useQuery({
    queryKey: ["sell-return-detail", id],
    queryFn: async () => (await api.get<ApiSuccess<SellReturnDetail>>(`/sell-returns/${id}`)).data.data,
  });

  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dueAmount = sellReturn ? Number(sellReturn.totalAmount) - Number(sellReturn.refundedAmount) : 0;
  if (sellReturn && amount === "" && dueAmount > 0) setAmount(dueAmount.toFixed(2));

  const payMutation = useMutation({
    mutationFn: async () => api.post(`/sell-returns/${id}/pay-due`, { paymentMethodId, amount: Number(amount), notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sell-return-detail", id] });
      qc.invalidateQueries({ queryKey: ["sell-returns"] });
      setAmount("");
      setPaymentMethodId("");
      setNotes("");
      setError(null);
    },
    onError: (err) =>
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(paymentMethodId && Number(amount) > 0 && Number(amount) <= dueAmount);

  return (
    <Modal title={`${isAr ? "الدفعات" : "Payments"} - ${sellReturn?.creditNoteNumber ?? "…"}`} onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-400">{isAr ? "جارٍ التحميل" : "Loading"}</p>}
      {sellReturn && (
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{isAr ? "المستحق" : "Due"}</span>
            <span className="ltr-nums font-semibold">{formatMoney(dueAmount, currency, locale)}</span>
          </div>

          {sellReturn.refundPayments.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-start">{isAr ? "الطريقة" : "Method"}</th>
                    <th className="px-2 py-1.5 text-end">{isAr ? "المبلغ" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sellReturn.refundPayments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{isAr ? p.paymentMethod.nameAr || p.paymentMethod.nameEn : p.paymentMethod.nameEn}</td>
                      <td className="px-2 py-1.5 text-end ltr-nums">{formatMoney(p.amount, currency, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sellReturn.refundPayments.length === 0 && <Alert variant="info">{isAr ? "لا توجد دفعات مسجلة" : "No payments recorded yet"}</Alert>}

          {dueAmount > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{isAr ? "طريقة الدفع" : "Payment Method"}</label>
                  <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className={cn(selectClass, "w-full")}>
                    <option value="">{isAr ? "اختر طريقة الدفع" : "Select method"}</option>
                    {(paymentMethods ?? []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {isAr ? m.nameAr || m.nameEn : m.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}</label>
                  <input type="number" min={0} max={dueAmount} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputClass, "w-full")} />
                </div>
              </div>
              <div>
                <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "w-full")} placeholder={isAr ? "اختياري" : "Optional"} />
              </div>
            </>
          )}

          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            {dueAmount > 0 && (
              <Button type="button" fullWidth disabled={!canSubmit || payMutation.isPending} onClick={() => payMutation.mutate()}>
                {payMutation.isPending ? "…" : isAr ? "تسجيل الدفعة" : "Record Payment"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
