import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { ShoppingBag, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

type ReturnReason = "DEFECTIVE" | "WRONG_ITEM" | "OVERSTOCK" | "OTHER";

const REASON_LABEL: Record<ReturnReason, { en: string; ar: string }> = {
  DEFECTIVE: { en: "Defective", ar: "معيب" },
  WRONG_ITEM: { en: "Wrong Item", ar: "صنف خاطئ" },
  OVERSTOCK: { en: "Overstock", ar: "فائض مخزون" },
  OTHER: { en: "Other", ar: "أخرى" },
};

interface PurchaseRow {
  id: string;
  referenceNumber: string;
  purchaseDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  supplier: { nameEn: string; nameAr: string | null };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; product: { nameEn: string; nameAr: string | null } }[];
}

interface PurchaseReturnRow {
  id: string;
  returnDate: string;
  totalAmount: string;
  refundedAmount: string;
  purchase: { referenceNumber: string };
  supplier: { nameEn: string; nameAr: string | null };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; reason: ReturnReason; purchaseItem: { product: { nameEn: string; nameAr: string | null } } }[];
}

export default function PurchasesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"PURCHASES" | "RETURNS">("PURCHASES");
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [returnFormOpen, setReturnFormOpen] = useState(false);

  // Purchases tab: its own page/limit/sort state, matching SuppliersPage.tsx's list-toolbar
  // pattern - each tab here is a genuinely separate paginated list backed by a different endpoint.
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseLimit, setPurchaseLimit] = useState(25);
  const [purchaseSortBy, setPurchaseSortBy] = useState("purchaseDate");
  const [purchaseSortOrder, setPurchaseSortOrder] = useState<"asc" | "desc">("desc");
  function handlePurchaseSort(field: string) {
    if (purchaseSortBy === field) setPurchaseSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setPurchaseSortBy(field);
      setPurchaseSortOrder("asc");
    }
  }
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseStatus, setPurchaseStatus] = useState<"" | "RECEIVED" | "CANCELLED">("");
  const [purchasePaymentStatus, setPurchasePaymentStatus] = useState<"" | "PAID" | "PARTIAL" | "DUE">("");
  const [purchaseFromDate, setPurchaseFromDate] = useState("");
  const [purchaseToDate, setPurchaseToDate] = useState("");
  const purchaseActiveFilterCount =
    (purchaseSupplierId ? 1 : 0) + (purchaseStatus ? 1 : 0) + (purchasePaymentStatus ? 1 : 0) + (purchaseFromDate ? 1 : 0) + (purchaseToDate ? 1 : 0);
  function clearPurchaseFilters() {
    setPurchaseSupplierId("");
    setPurchaseStatus("");
    setPurchasePaymentStatus("");
    setPurchaseFromDate("");
    setPurchaseToDate("");
    setPurchasePage(1);
  }

  // Returns tab: separate page/limit/sort state - see purchase.service.ts's listReturns() for the
  // backend side (its own SORTABLE_FIELDS whitelist, independent of the purchases list).
  const [returnPage, setReturnPage] = useState(1);
  const [returnLimit, setReturnLimit] = useState(25);
  const [returnSortBy, setReturnSortBy] = useState("returnDate");
  const [returnSortOrder, setReturnSortOrder] = useState<"asc" | "desc">("desc");
  function handleReturnSort(field: string) {
    if (returnSortBy === field) setReturnSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setReturnSortBy(field);
      setReturnSortOrder("asc");
    }
  }
  const [returnSupplierId, setReturnSupplierId] = useState("");
  const [returnFromDate, setReturnFromDate] = useState("");
  const [returnToDate, setReturnToDate] = useState("");
  const returnActiveFilterCount = (returnSupplierId ? 1 : 0) + (returnFromDate ? 1 : 0) + (returnToDate ? 1 : 0);
  function clearReturnFilters() {
    setReturnSupplierId("");
    setReturnFromDate("");
    setReturnToDate("");
    setReturnPage(1);
  }

  const { data: supplierOptions } = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: async () => (await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { limit: 100 } })).data.data,
  });

  // Shared with each tab's "export all matching rows" fetch below - keep every filter param here
  // so export always reflects exactly what's currently on screen, just without the page cap.
  const purchaseFilterParams = {
    sortBy: purchaseSortBy,
    sortOrder: purchaseSortOrder,
    ...(purchaseSupplierId ? { supplierId: purchaseSupplierId } : {}),
    ...(purchaseStatus ? { status: purchaseStatus } : {}),
    ...(purchasePaymentStatus ? { paymentStatus: purchasePaymentStatus } : {}),
    ...(purchaseFromDate ? { from: purchaseFromDate } : {}),
    ...(purchaseToDate ? { to: purchaseToDate } : {}),
  };
  const returnFilterParams = {
    sortBy: returnSortBy,
    sortOrder: returnSortOrder,
    ...(returnSupplierId ? { supplierId: returnSupplierId } : {}),
    ...(returnFromDate ? { from: returnFromDate } : {}),
    ...(returnToDate ? { to: returnToDate } : {}),
  };

  const { data: purchases } = useQuery({
    queryKey: ["purchases", purchasePage, purchaseLimit, purchaseFilterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PurchaseRow[]>>("/purchases", {
        params: { ...purchaseFilterParams, page: purchasePage, limit: purchaseLimit },
      });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const { data: returns } = useQuery({
    queryKey: ["purchase-returns", returnPage, returnLimit, returnFilterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PurchaseReturnRow[]>>("/purchases/returns", {
        params: { ...returnFilterParams, page: returnPage, limit: returnLimit },
      });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const purchaseColumns: { key: string; label: string; sortField?: string; render: (p: PurchaseRow) => ReactNode; exportValue: (p: PurchaseRow) => string | number | null }[] = [
    {
      key: "purchaseDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "purchaseDate",
      render: (p) => <span className="ltr-nums">{new Date(p.purchaseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (p) => new Date(p.purchaseDate).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "referenceNumber",
      label: isAr ? "المرجع" : "Reference",
      sortField: "referenceNumber",
      render: (p) => <span className="ltr-nums">{p.referenceNumber}</span>,
      exportValue: (p) => p.referenceNumber,
    },
    {
      key: "supplier",
      label: isAr ? "المورد" : "Supplier",
      render: (p) => (isAr ? p.supplier.nameAr || p.supplier.nameEn : p.supplier.nameEn),
      exportValue: (p) => (isAr ? p.supplier.nameAr || p.supplier.nameEn : p.supplier.nameEn),
    },
    {
      key: "items",
      label: isAr ? "الأصناف" : "Items",
      render: (p) => (
        <>
          {p.items.map((item) => (
            <div key={item.id} className="text-xs text-slate-600">
              {isAr ? item.product.nameAr || item.product.nameEn : item.product.nameEn}
              <span className="ltr-nums text-slate-400"> × {item.quantity}</span>
            </div>
          ))}
        </>
      ),
      exportValue: (p) => p.items.map((item) => `${isAr ? item.product.nameAr || item.product.nameEn : item.product.nameEn} x${item.quantity}`).join("; "),
    },
    {
      key: "totalAmount",
      label: isAr ? "الإجمالي" : "Total",
      sortField: "totalAmount",
      render: (p) => <span className="ltr-nums">{formatMoney(p.totalAmount, currency, locale)}</span>,
      exportValue: (p) => Number(p.totalAmount),
    },
    {
      key: "paidAmount",
      label: isAr ? "المدفوع" : "Paid",
      render: (p) => <span className="ltr-nums">{formatMoney(p.paidAmount, currency, locale)}</span>,
      exportValue: (p) => Number(p.paidAmount),
    },
    {
      key: "createdByUser",
      label: isAr ? "بواسطة" : "By",
      render: (p) => p.createdByUser.fullNameEn,
      exportValue: (p) => p.createdByUser.fullNameEn,
    },
  ];
  const purchaseColumnVisibility = useColumnVisibility("purchases", purchaseColumns.map((c) => c.key));
  const visiblePurchaseColumns = purchaseColumns.filter((c) => purchaseColumnVisibility.isVisible(c.key));

  const returnColumns: { key: string; label: string; sortField?: string; render: (r: PurchaseReturnRow) => ReactNode; exportValue: (r: PurchaseReturnRow) => string | number | null }[] = [
    {
      key: "returnDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "returnDate",
      render: (r) => <span className="ltr-nums">{new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (r) => new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "purchaseRef",
      label: isAr ? "مرجع الشراء" : "Purchase Ref",
      render: (r) => <span className="ltr-nums">{r.purchase.referenceNumber}</span>,
      exportValue: (r) => r.purchase.referenceNumber,
    },
    {
      key: "supplier",
      label: isAr ? "المورد" : "Supplier",
      render: (r) => (isAr ? r.supplier.nameAr || r.supplier.nameEn : r.supplier.nameEn),
      exportValue: (r) => (isAr ? r.supplier.nameAr || r.supplier.nameEn : r.supplier.nameEn),
    },
    {
      key: "items",
      label: isAr ? "الأصناف" : "Items",
      render: (r) => (
        <>
          {r.items.map((item) => (
            <div key={item.id} className="text-xs text-slate-600">
              {isAr ? item.purchaseItem.product.nameAr || item.purchaseItem.product.nameEn : item.purchaseItem.product.nameEn}
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
              `${isAr ? item.purchaseItem.product.nameAr || item.purchaseItem.product.nameEn : item.purchaseItem.product.nameEn} x${item.quantity} (${isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en})`,
          )
          .join("; "),
    },
    {
      key: "totalAmount",
      label: isAr ? "الإجمالي" : "Total",
      sortField: "totalAmount",
      render: (r) => <span className="ltr-nums">{formatMoney(r.totalAmount, currency, locale)}</span>,
      exportValue: (r) => Number(r.totalAmount),
    },
    {
      key: "refundedAmount",
      label: isAr ? "المسترد" : "Refunded",
      render: (r) => <span className="ltr-nums">{formatMoney(r.refundedAmount, currency, locale)}</span>,
      exportValue: (r) => Number(r.refundedAmount),
    },
    {
      key: "createdByUser",
      label: isAr ? "بواسطة" : "By",
      render: (r) => r.createdByUser.fullNameEn,
      exportValue: (r) => r.createdByUser.fullNameEn,
    },
  ];
  const returnColumnVisibility = useColumnVisibility("purchase-returns", returnColumns.map((c) => c.key));
  const visibleReturnColumns = returnColumns.filter((c) => returnColumnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "المشتريات" : "Purchases"}
        actions={
          tab === "PURCHASES" ? (
            <Button onClick={() => setPurchaseFormOpen(true)}>
              + {isAr ? "شراء جديد" : "New Purchase"}
            </Button>
          ) : (
            <Button onClick={() => setReturnFormOpen(true)}>
              + {isAr ? "مرتجع شراء جديد" : "New Purchase Return"}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          icon={ShoppingBag}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "المشتريات" : "Purchases"}
          value={String(purchases?.meta.total ?? 0)}
        />
        <StatCard
          icon={Undo2}
          cardBg="bg-rose-50"
          iconBg="bg-rose-500"
          iconColor="text-white"
          label={isAr ? "مرتجعات الشراء" : "Purchase Returns"}
          value={String(returns?.meta.total ?? 0)}
        />
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => setTab("PURCHASES")}
          className={cn(
            "pb-2.5 text-sm font-semibold transition-colors",
            tab === "PURCHASES" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {isAr ? "المشتريات" : "Purchases"}
        </button>
        <button
          onClick={() => setTab("RETURNS")}
          className={cn(
            "pb-2.5 text-sm font-semibold transition-colors",
            tab === "RETURNS" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {isAr ? "مرتجعات الشراء" : "Purchase Returns"}
        </button>
      </div>

      {tab === "PURCHASES" && (
        <>
          <TableContainer>
            <TableToolbar>
              <FiltersMenu activeCount={purchaseActiveFilterCount} onClear={clearPurchaseFilters} isAr={isAr}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المورد" : "Supplier"}</label>
                  <select
                    value={purchaseSupplierId}
                    onChange={(e) => {
                      setPurchaseSupplierId(e.target.value);
                      setPurchasePage(1);
                    }}
                    className={cn(selectClass, "w-full")}
                  >
                    <option value="">{isAr ? "الكل" : "All"}</option>
                    {supplierOptions?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {isAr ? s.nameAr || s.nameEn : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الشراء" : "Purchase Status"}</label>
                  <select
                    value={purchaseStatus}
                    onChange={(e) => {
                      setPurchaseStatus(e.target.value as typeof purchaseStatus);
                      setPurchasePage(1);
                    }}
                    className={cn(selectClass, "w-full")}
                  >
                    <option value="">{isAr ? "الكل" : "All"}</option>
                    <option value="RECEIVED">{isAr ? "مستلم" : "Received"}</option>
                    <option value="CANCELLED">{isAr ? "ملغى" : "Cancelled"}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الدفع" : "Payment Status"}</label>
                  <select
                    value={purchasePaymentStatus}
                    onChange={(e) => {
                      setPurchasePaymentStatus(e.target.value as typeof purchasePaymentStatus);
                      setPurchasePage(1);
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
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
                  <input
                    type="date"
                    value={purchaseFromDate}
                    onChange={(e) => {
                      setPurchaseFromDate(e.target.value);
                      setPurchasePage(1);
                    }}
                    className={cn(inputClass, "w-full ltr-nums")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
                  <input
                    type="date"
                    value={purchaseToDate}
                    onChange={(e) => {
                      setPurchaseToDate(e.target.value);
                      setPurchasePage(1);
                    }}
                    className={cn(inputClass, "w-full ltr-nums")}
                  />
                </div>
              </FiltersMenu>
              <div className="ms-auto flex items-center gap-1.5">
                <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
                <PageSizeSelect
                  value={purchaseLimit}
                  onChange={(n) => {
                    setPurchaseLimit(n);
                    setPurchasePage(1);
                  }}
                />
                <ColumnVisibilityMenu
                  columns={purchaseColumns.map((c) => ({ key: c.key, label: c.label }))}
                  isVisible={purchaseColumnVisibility.isVisible}
                  onToggle={purchaseColumnVisibility.toggle}
                  isAr={isAr}
                />
                <TableExportButtons
                  title={isAr ? "المشتريات" : "Purchases"}
                  columns={visiblePurchaseColumns.map((c) => ({ key: c.key, label: c.label }))}
                  getRows={async () => {
                    const all = await fetchAllRows<PurchaseRow>(async (p, l) => {
                      const res = await api.get<ApiSuccess<PurchaseRow[]>>("/purchases", { params: { ...purchaseFilterParams, page: p, limit: l } });
                      return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                    });
                    return all.map((p) => Object.fromEntries(visiblePurchaseColumns.map((c) => [c.key, c.exportValue(p)])));
                  }}
                  isAr={isAr}
                />
              </div>
            </TableToolbar>
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    {visiblePurchaseColumns.map((c) =>
                      c.sortField ? (
                        <SortableTh key={c.key} field={c.sortField} sortBy={purchaseSortBy} sortOrder={purchaseSortOrder} onSort={handlePurchaseSort}>
                          {c.label}
                        </SortableTh>
                      ) : (
                        <Th key={c.key}>{c.label}</Th>
                      ),
                    )}
                  </tr>
                </THead>
                <tbody>
                  {purchases?.rows.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      {visiblePurchaseColumns.map((c) => (
                        <td key={c.key} className="px-4 py-3">
                          {c.render(p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {purchases?.rows.length === 0 && (
                    <tr>
                      <td colSpan={visiblePurchaseColumns.length} className="px-4 py-8 text-center text-slate-400">
                        {t("common.noResults")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </TableScroll>
          </TableContainer>

          {purchases?.meta && purchases.meta.totalPages > 1 && (
            <Pagination
              page={purchasePage}
              totalPages={purchases.meta.totalPages}
              onPrev={() => setPurchasePage((p) => p - 1)}
              onNext={() => setPurchasePage((p) => p + 1)}
              label={`${t("common.page")} ${purchasePage} ${t("common.of")} ${purchases.meta.totalPages}`}
            />
          )}
        </>
      )}

      {tab === "RETURNS" && (
        <>
          <TableContainer>
            <TableToolbar>
              <FiltersMenu activeCount={returnActiveFilterCount} onClear={clearReturnFilters} isAr={isAr}>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المورد" : "Supplier"}</label>
                  <select
                    value={returnSupplierId}
                    onChange={(e) => {
                      setReturnSupplierId(e.target.value);
                      setReturnPage(1);
                    }}
                    className={cn(selectClass, "w-full")}
                  >
                    <option value="">{isAr ? "الكل" : "All"}</option>
                    {supplierOptions?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {isAr ? s.nameAr || s.nameEn : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
                  <input
                    type="date"
                    value={returnFromDate}
                    onChange={(e) => {
                      setReturnFromDate(e.target.value);
                      setReturnPage(1);
                    }}
                    className={cn(inputClass, "w-full ltr-nums")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
                  <input
                    type="date"
                    value={returnToDate}
                    onChange={(e) => {
                      setReturnToDate(e.target.value);
                      setReturnPage(1);
                    }}
                    className={cn(inputClass, "w-full ltr-nums")}
                  />
                </div>
              </FiltersMenu>
              <div className="ms-auto flex items-center gap-1.5">
                <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
                <PageSizeSelect
                  value={returnLimit}
                  onChange={(n) => {
                    setReturnLimit(n);
                    setReturnPage(1);
                  }}
                />
                <ColumnVisibilityMenu
                  columns={returnColumns.map((c) => ({ key: c.key, label: c.label }))}
                  isVisible={returnColumnVisibility.isVisible}
                  onToggle={returnColumnVisibility.toggle}
                  isAr={isAr}
                />
                <TableExportButtons
                  title={isAr ? "مرتجعات الشراء" : "Purchase Returns"}
                  columns={visibleReturnColumns.map((c) => ({ key: c.key, label: c.label }))}
                  getRows={async () => {
                    const all = await fetchAllRows<PurchaseReturnRow>(async (p, l) => {
                      const res = await api.get<ApiSuccess<PurchaseReturnRow[]>>("/purchases/returns", { params: { ...returnFilterParams, page: p, limit: l } });
                      return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                    });
                    return all.map((r) => Object.fromEntries(visibleReturnColumns.map((c) => [c.key, c.exportValue(r)])));
                  }}
                  isAr={isAr}
                />
              </div>
            </TableToolbar>
            <TableScroll>
              <Table>
                <THead>
                  <tr>
                    {visibleReturnColumns.map((c) =>
                      c.sortField ? (
                        <SortableTh key={c.key} field={c.sortField} sortBy={returnSortBy} sortOrder={returnSortOrder} onSort={handleReturnSort}>
                          {c.label}
                        </SortableTh>
                      ) : (
                        <Th key={c.key}>{c.label}</Th>
                      ),
                    )}
                  </tr>
                </THead>
                <tbody>
                  {returns?.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      {visibleReturnColumns.map((c) => (
                        <td key={c.key} className="px-4 py-3">
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {returns?.rows.length === 0 && (
                    <tr>
                      <td colSpan={visibleReturnColumns.length} className="px-4 py-8 text-center text-slate-400">
                        {t("common.noResults")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </TableScroll>
          </TableContainer>

          {returns?.meta && returns.meta.totalPages > 1 && (
            <Pagination
              page={returnPage}
              totalPages={returns.meta.totalPages}
              onPrev={() => setReturnPage((p) => p - 1)}
              onNext={() => setReturnPage((p) => p + 1)}
              label={`${t("common.page")} ${returnPage} ${t("common.of")} ${returns.meta.totalPages}`}
            />
          )}
        </>
      )}

      {purchaseFormOpen && (
        <PurchaseFormModal
          isAr={isAr}
          onClose={() => setPurchaseFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["purchases"] });
            setPurchaseFormOpen(false);
          }}
        />
      )}

      {returnFormOpen && (
        <PurchaseReturnFormModal
          isAr={isAr}
          onClose={() => setReturnFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["purchase-returns"] });
            setReturnFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface ProductPick {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  purchasePrice: string;
}

interface PurchaseLine {
  productId: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

function PurchaseFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductPick[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function runSupplierSearch(value: string) {
    setSupplierSearch(value);
    if (!value.trim()) return setSupplierResults([]);
    const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { search: value, limit: 6 } });
    setSupplierResults(res.data.data);
  }

  async function runProductSearch(value: string) {
    setProductSearch(value);
    if (!value.trim()) return setProductResults([]);
    const res = await api.get<ApiSuccess<ProductPick[]>>("/products", { params: { search: value, limit: 8 } });
    setProductResults(res.data.data);
  }

  function addProduct(p: ProductPick) {
    setProductSearch("");
    setProductResults([]);
    setLines((prev) => {
      if (prev.some((l) => l.productId === p.id)) return prev;
      return [...prev, { productId: p.id, nameEn: p.nameEn, nameAr: p.nameAr, sku: p.sku, quantity: 1, unitCost: Number(p.purchasePrice) }];
    });
  }

  function updateLine(productId: string, patch: Partial<PurchaseLine>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/purchases", {
        supplierId: supplier!.id,
        businessLocationId,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(supplier) && Boolean(businessLocationId) && lines.length > 0 && lines.every((l) => l.quantity > 0 && l.unitCost >= 0);

  return (
    <Modal
      title={isAr ? "شراء جديد" : "New Purchase"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "حفظ الشراء" : "Save Purchase"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
          <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={selectClass}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <label className={labelClass}>{isAr ? "المورد" : "Supplier"}</label>
          <input
            value={supplier ? (isAr ? supplier.nameAr || supplier.nameEn : supplier.nameEn) : supplierSearch}
            onChange={(e) => {
              setSupplier(null);
              runSupplierSearch(e.target.value);
            }}
            placeholder={isAr ? "ابحث عن مورد..." : "Search for a supplier..."}
            className={inputClass}
          />
          {supplierResults.length > 0 && !supplier && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {supplierResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSupplier(s);
                    setSupplierResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {isAr ? s.nameAr || s.nameEn : s.nameEn} <span className="ltr-nums text-xs text-slate-400">({s.code})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className={labelClass}>{isAr ? "إضافة منتج" : "Add Product"}</label>
          <input
            value={productSearch}
            onChange={(e) => runProductSearch(e.target.value)}
            placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
            className={inputClass}
          />
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {productResults.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100">
                  {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.productId} className="rounded-lg border border-slate-200 p-2.5">
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-800">
                  <span>
                    {isAr ? l.nameAr || l.nameEn : l.nameEn} <span className="ltr-nums text-xs text-slate-400">({l.sku})</span>
                  </span>
                  <button onClick={() => removeLine(l.productId)} className="text-xs text-red-500 hover:text-red-700">
                    {isAr ? "إزالة" : "Remove"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الكمية" : "Quantity"}</label>
                    <input
                      type="number"
                      min={0.001}
                      step="0.001"
                      value={l.quantity}
                      onChange={(e) => updateLine(l.productId, { quantity: Number(e.target.value) })}
                      className={cn(inputClass, "ltr-nums")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "تكلفة الوحدة" : "Unit Cost"}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unitCost}
                      onChange={(e) => updateLine(l.productId, { unitCost: Number(e.target.value) })}
                      className={cn(inputClass, "ltr-nums")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className={labelClass}>{isAr ? "المبلغ المدفوع" : "Paid Amount"}</label>
          <input type="number" min={0} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}

interface PurchasePick {
  id: string;
  referenceNumber: string;
}

interface ReturnablePurchase {
  id: string;
  referenceNumber: string;
  supplier: { nameEn: string; nameAr: string | null };
  items: {
    id: string;
    productNameEn: string;
    productNameAr: string | null;
    quantity: string;
    unitCost: string;
    alreadyReturned: string;
    remaining: string;
  }[];
}

interface SelectedReturnLine {
  purchaseItemId: string;
  quantity: number;
  reason: ReturnReason;
  note?: string;
}

function PurchaseReturnFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PurchasePick[]>([]);
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, SelectedReturnLine>>({});
  const [refundedAmount, setRefundedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: purchase } = useQuery({
    queryKey: ["returnable-purchase", purchaseId],
    queryFn: async () => (await api.get<ApiSuccess<ReturnablePurchase>>(`/purchases/${purchaseId}/returnable`)).data.data,
    enabled: Boolean(purchaseId),
  });

  async function runSearch(value: string) {
    setSearch(value);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<PurchasePick[]>>("/purchases", { params: { limit: 50 } });
    setResults(res.data.data.filter((p) => p.referenceNumber.toLowerCase().includes(value.toLowerCase())));
  }

  function toggleLine(itemId: string, remaining: number) {
    setLines((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = { purchaseItemId: itemId, quantity: remaining, reason: "DEFECTIVE" };
      return next;
    });
  }

  function updateLine(itemId: string, patch: Partial<SelectedReturnLine>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/purchases/returns", {
        purchaseId,
        items: Object.values(lines).map((l) => ({ purchaseItemId: l.purchaseItemId, quantity: l.quantity, reason: l.reason, note: l.note || undefined })),
        refundedAmount: refundedAmount ? Number(refundedAmount) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(purchaseId) && Object.keys(lines).length > 0 && Object.values(lines).every((l) => l.quantity > 0);

  return (
    <Modal
      title={isAr ? "مرتجع شراء جديد" : "New Purchase Return"}
      onClose={onClose}
      size="lg"
      footer={
        purchase ? (
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
            fullWidth
          >
            {mutation.isPending ? "…" : isAr ? "تقديم المرتجع" : "Submit Return"}
          </Button>
        ) : undefined
      }
    >
      {!purchaseId && (
        <div className="relative">
          <label className={labelClass}>{isAr ? "مرجع الشراء" : "Purchase Reference"}</label>
          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث برقم المرجع" : "Search by reference number"}
            className={inputClass}
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPurchaseId(p.id);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {p.referenceNumber}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {purchase && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {purchase.referenceNumber} — {isAr ? purchase.supplier.nameAr || purchase.supplier.nameEn : purchase.supplier.nameEn}
          </p>

          <div className="space-y-2">
            {purchase.items.map((item) => {
              const remaining = Number(item.remaining);
              const selected = lines[item.id];
              return (
                <div key={item.id} className={cn("rounded-lg border p-2.5", remaining <= 0 ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200")}>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" disabled={remaining <= 0} checked={Boolean(selected)} onChange={() => toggleLine(item.id, remaining)} />
                    {isAr ? item.productNameAr || item.productNameEn : item.productNameEn}
                    <span className="ltr-nums text-xs text-slate-400">
                      ({isAr ? "المتبقي" : "remaining"}: {item.remaining} / {item.quantity})
                    </span>
                  </label>
                  {selected && (
                    <div className="mt-2 grid grid-cols-3 gap-2 ps-6">
                      <input
                        type="number"
                        min={0.001}
                        max={remaining}
                        step="0.001"
                        value={selected.quantity}
                        onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })}
                        className={cn(inputClass, "ltr-nums")}
                      />
                      <select value={selected.reason} onChange={(e) => updateLine(item.id, { reason: e.target.value as ReturnReason })} className={selectClass}>
                        {(Object.keys(REASON_LABEL) as ReturnReason[]).map((r) => (
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

          <div>
            <label className={labelClass}>{isAr ? "المبلغ المسترد" : "Refunded Amount"}</label>
            <input type="number" min={0} value={refundedAmount} onChange={(e) => setRefundedAmount(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
