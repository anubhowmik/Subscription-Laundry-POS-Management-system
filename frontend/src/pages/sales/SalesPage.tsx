import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods, useCategories, useServiceCategories, useCustomers } from "../../api/posApi";
import { cn } from "../../lib/cn";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton, RowActionLink } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { SearchInput } from "../../components/ui/SearchInput";
import { selectClass, inputClass, labelClass } from "../../components/ui/formClasses";
import { Receipt, Eye, FileText, Banknote, Plus } from "lucide-react";
import { useCurrentApp } from "../../components/layout/Sidebar";

interface Sale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  estimatedReadyAt: string | null;
  paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
  notes: string | null;
  customer: { nameEn: string; nameAr: string; phone: string };
  businessLocation: { branchName: string; group: { nameEn: string; nameAr: string | null } | null };
  createdByUser: { fullNameEn: string };
  items: { quantity: string; fulfillmentStatus: "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED" }[];
  payments: { amount: string; paymentDate: string; paymentMethod: { nameEn: string; nameAr: string } }[];
  sellReturns: { totalAmount: string }[];
}

const STATUS_VARIANT: Record<Sale["paymentStatus"], "success" | "warning" | "danger" | "info"> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "danger",
  OVERPAID: "info",
};

// The reference's own "Status" column (`shipping_status` - Ordered/Under Cleaning/Ready/
// Delivered) is tracked per-INVOICE there; this app tracks fulfillment per-ITEM instead (see
// SaleItem.fulfillmentStatus/SaleDetailModal.tsx), a deliberate finer-grained conversion made
// early in this rebuild. Converting the column itself still means showing SOME overall status per
// row, not dropping it - this derives the most conservative one (the furthest-behind item), since
// an order isn't really "Ready" until every garment in it is.
type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";
const FULFILLMENT_ORDER: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED"];
const FULFILLMENT_VARIANT: Record<ItemFulfillmentStatus, "neutral" | "warning" | "info" | "success" | "danger"> = {
  PENDING: "neutral",
  IN_PROGRESS: "warning",
  READY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};
function overallFulfillmentStatus(items: { fulfillmentStatus?: ItemFulfillmentStatus }[]): ItemFulfillmentStatus | null {
  const statuses = items.map((i) => i.fulfillmentStatus).filter((s): s is ItemFulfillmentStatus => Boolean(s));
  if (statuses.length === 0) return null;
  const active = statuses.filter((s) => s !== "CANCELLED");
  if (active.length === 0) return "CANCELLED";
  return active.reduce((worst, s) => (FULFILLMENT_ORDER.indexOf(s) < FULFILLMENT_ORDER.indexOf(worst) ? s : worst));
}

interface SalesPageProps {
  /** "POS" scopes this exact same list to sales rung up through the touch-grid screen only -
   * reference's own "List POS" (`SellPosController@index`) is the SAME `/sells` data/columns as
   * "All Sales", just with `is_direct_sale = 0` added to the query, and its own "+Add" pointing
   * at the POS screen instead of the back-office Add Sale form - see schema.prisma's SaleChannel
   * comment and sale.service.ts's list(). Omitted (the default, used by the plain `/sales` route)
   * means unfiltered, matching the reference's own "All Sales" never adding that extra clause. */
  channel?: "POS";
}

export default function SalesPage({ channel }: SalesPageProps = {}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { currentLocation, locations } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [paymentStatus, setPaymentStatus] = useState<"" | "PAID" | "PARTIAL" | "DUE" | "OVERPAID">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [locationGroupId, setLocationGroupId] = useState("");
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [onlyHasReturn, setOnlyHasReturn] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; nameEn: string; nameAr: string | null } | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [pickedProduct, setPickedProduct] = useState<{ id: string; nameEn: string; nameAr: string } | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [pickedService, setPickedService] = useState<{ id: string; nameEn: string; nameAr: string } | null>(null);
  const activeFilterCount =
    (paymentStatus ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (locationGroupId ? 1 : 0) +
    (businessLocationId ? 1 : 0) +
    (createdBy ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (serviceCategoryId ? 1 : 0) +
    (onlyHasReturn ? 1 : 0) +
    (pickedCustomer ? 1 : 0) +
    (pickedProduct ? 1 : 0) +
    (pickedService ? 1 : 0);
  function clearAllFilters() {
    setPaymentStatus("");
    setFromDate("");
    setToDate("");
    setLocationGroupId("");
    setBusinessLocationId("");
    setCreatedBy("");
    setCategoryId("");
    setServiceCategoryId("");
    setOnlyHasReturn(false);
    setCustomerSearch("");
    setPickedCustomer(null);
    setProductSearch("");
    setPickedProduct(null);
    setServiceSearch("");
    setPickedService(null);
    setPage(1);
  }
  const { data: locationGroups } = useQuery({
    queryKey: ["business-location-groups"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; nameEn: string; nameAr: string | null }[]>>("/business-location-groups", { params: { limit: 100 } })).data.data,
  });
  const { data: staffUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });
  const { data: productCategories } = useCategories();
  const { data: serviceCategories } = useServiceCategories();
  const { data: customerResults } = useCustomers(customerSearch);
  const { data: productResults } = useQuery({
    queryKey: ["sales-product-search", productSearch],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; nameEn: string; nameAr: string; sku: string }[]>>("/products", { params: { search: productSearch, limit: 20 } })).data.data,
    enabled: productSearch.length > 0,
  });
  const { data: serviceResults } = useQuery({
    queryKey: ["sales-service-search", serviceSearch],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; nameEn: string; nameAr: string; code: string }[]>>("/services", { params: { search: serviceSearch, limit: 20 } })).data.data,
    enabled: serviceSearch.length > 0,
  });
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [payingSaleId, setPayingSaleId] = useState<string | null>(null);
  // Est. Ready is only ever set for a sale with a service line (see pos.service.ts) - it's always
  // "-" for every row in Product POS, so hide the column there instead of showing a dash for the
  // whole table. Same pattern as ReportsPage.tsx/DashboardPage.tsx.
  const currentApp = useCurrentApp();
  const hideEstimatedReady = currentApp?.key === "posProduct";
  // "List POS"'s own "+Add" button must land on THIS app's POS screen, not always POS Laundry's -
  // /sales/list-pos is a shared route (no `only` tag in Sidebar.tsx) rendered inside all 3 selling
  // apps, so a hardcoded "/pos" here would silently jump Service/Product POS users into POS
  // Laundry's screen (found live: "every app is independent" bug report).
  const posRoute = currentApp?.key === "posService" ? "/pos/service" : currentApp?.key === "posProduct" ? "/pos/product" : "/pos";

  // Sortable column headers - backend already whitelists these fields (sale.service.ts's
  // SORTABLE_FIELDS: saleDate, totalAmount, invoiceNumber, createdAt).
  const [sortBy, setSortBy] = useState("saleDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Converted column-for-column from the reference's own live DataTables column-key list
  // (`sell/index.blade.php`'s AJAX request: transaction_date, invoice_no, conatct_name, mobile,
  // location_group, business_location, payment_status, payment_methods, last_payment_date,
  // final_total, return_due, total_after_return, total_paid, total_remaining, shipping_status,
  // total_items, added_by, additional_notes) - same order, so nothing gets missed by only working
  // from a screenshot of the rendered header row.
  const columns: { key: string; label: string; sortField?: string; render: (s: Sale) => ReactNode; exportValue: (s: Sale) => string | number | null }[] = [
    { key: "saleDate", label: "Date", sortField: "saleDate", render: (s) => <span className="ltr-nums">{formatDate(s.saleDate, locale)}</span>, exportValue: (s) => formatDate(s.saleDate, locale) },
    { key: "invoiceNumber", label: t("pos.invoice"), sortField: "invoiceNumber", render: (s) => <span className="ltr-nums">{s.invoiceNumber}</span>, exportValue: (s) => s.invoiceNumber },
    {
      key: "customerName",
      label: t("common.name"),
      render: (s) => (isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn),
      exportValue: (s) => (isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn),
    },
    {
      key: "contactNo",
      label: isAr ? "رقم التواصل" : "Contact No.",
      render: (s) => <span className="ltr-nums">{s.customer.phone}</span>,
      exportValue: (s) => s.customer.phone,
    },
    {
      key: "locationGroup",
      label: isAr ? "مجموعة الفروع" : "Location Group",
      render: (s) => (s.businessLocation.group ? (isAr ? s.businessLocation.group.nameAr || s.businessLocation.group.nameEn : s.businessLocation.group.nameEn) : "—"),
      exportValue: (s) => (s.businessLocation.group ? s.businessLocation.group.nameEn : null),
    },
    {
      key: "location",
      label: isAr ? "الفرع" : "Location",
      render: (s) => s.businessLocation.branchName,
      exportValue: (s) => s.businessLocation.branchName,
    },
    {
      key: "paymentStatus",
      label: isAr ? "حالة الدفع" : "Payment status",
      render: (s) => <Badge variant={STATUS_VARIANT[s.paymentStatus]}>{s.paymentStatus}</Badge>,
      exportValue: (s) => s.paymentStatus,
    },
    {
      key: "paymentMethod",
      label: isAr ? "طريقة الدفع" : "Payment Method",
      render: (s) => {
        const methods = [...new Set(s.payments.map((p) => p.paymentMethod.nameEn))];
        if (methods.length === 0) return "—";
        if (methods.length === 1) return isAr ? s.payments[0].paymentMethod.nameAr || methods[0] : methods[0];
        return isAr ? "متعدد" : "Multiple";
      },
      exportValue: (s) => {
        const methods = [...new Set(s.payments.map((p) => p.paymentMethod.nameEn))];
        return methods.length === 0 ? null : methods.length === 1 ? methods[0] : "Multiple";
      },
    },
    {
      key: "lastPaymentDate",
      label: isAr ? "تاريخ آخر دفعة" : "Last Payment Date",
      render: (s) => (s.payments[0] ? <span className="ltr-nums">{formatDate(s.payments[0].paymentDate, locale)}</span> : "—"),
      exportValue: (s) => (s.payments[0] ? formatDate(s.payments[0].paymentDate, locale) : null),
    },
    { key: "totalAmount", label: t("pos.total"), sortField: "totalAmount", render: (s) => <span className="ltr-nums">{formatMoney(s.totalAmount, currency, locale)}</span>, exportValue: (s) => Number(s.totalAmount) },
    {
      key: "totalReturn",
      label: isAr ? "إجمالي المرتجع" : "Total Return",
      render: (s) => <span className="ltr-nums">{formatMoney(s.sellReturns.reduce((sum, r) => sum + Number(r.totalAmount), 0), currency, locale)}</span>,
      exportValue: (s) => s.sellReturns.reduce((sum, r) => sum + Number(r.totalAmount), 0),
    },
    {
      key: "totalAfterReturn",
      label: isAr ? "الإجمالي بعد المرتجع" : "Total After Return",
      render: (s) => <span className="ltr-nums">{formatMoney(Number(s.totalAmount) - s.sellReturns.reduce((sum, r) => sum + Number(r.totalAmount), 0), currency, locale)}</span>,
      exportValue: (s) => Number(s.totalAmount) - s.sellReturns.reduce((sum, r) => sum + Number(r.totalAmount), 0),
    },
    { key: "paidAmount", label: isAr ? "إجمالي المدفوع" : "Total paid", render: (s) => <span className="ltr-nums">{formatMoney(s.paidAmount, currency, locale)}</span>, exportValue: (s) => Number(s.paidAmount) },
    { key: "dueAmount", label: isAr ? "المستحق" : "Sell Due", render: (s) => <span className="ltr-nums">{formatMoney(s.dueAmount, currency, locale)}</span>, exportValue: (s) => Number(s.dueAmount) },
    {
      key: "status",
      label: t("common.status"),
      render: (s) => {
        const overall = overallFulfillmentStatus(s.items);
        return overall ? <Badge variant={FULFILLMENT_VARIANT[overall]}>{overall.replace("_", " ")}</Badge> : "—";
      },
      exportValue: (s) => overallFulfillmentStatus(s.items),
    },
    {
      key: "totalItems",
      label: isAr ? "إجمالي القطع" : "Total Items",
      render: (s) => <span className="ltr-nums">{s.items.reduce((sum, i) => sum + Number(i.quantity), 0)}</span>,
      exportValue: (s) => s.items.reduce((sum, i) => sum + Number(i.quantity), 0),
    },
    { key: "addedBy", label: isAr ? "أضيف بواسطة" : "Added By", render: (s) => s.createdByUser.fullNameEn, exportValue: (s) => s.createdByUser.fullNameEn },
    { key: "sellNote", label: isAr ? "ملاحظة البيع" : "Sell note", render: (s) => s.notes ?? "—", exportValue: (s) => s.notes },
    ...(!hideEstimatedReady
      ? [
          {
            key: "estimatedReadyAt",
            label: isAr ? "الجاهزية المتوقعة" : "Est. Ready",
            render: (s: Sale) => <span className="ltr-nums">{s.estimatedReadyAt ? new Date(s.estimatedReadyAt).toLocaleString(locale) : "-"}</span>,
            exportValue: (s: Sale) => (s.estimatedReadyAt ? new Date(s.estimatedReadyAt).toLocaleString(locale) : null),
          },
        ]
      : []),
  ];

  const columnVisibility = useColumnVisibility(
    channel === "POS" ? "sales-list-pos" : "sales",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search,
    sortBy,
    sortOrder,
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(locationGroupId ? { locationGroupId } : {}),
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(serviceCategoryId ? { serviceCategoryId } : {}),
    ...(onlyHasReturn ? { onlyHasReturn: "true" } : {}),
    ...(pickedCustomer ? { customerId: pickedCustomer.id } : {}),
    ...(pickedProduct ? { productId: pickedProduct.id } : {}),
    ...(pickedService ? { serviceId: pickedService.id } : {}),
    ...(channel ? { channel } : {}),
  };

  const { data } = useQuery({
    queryKey: ["sales", channel, page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Sale[]>>("/sales", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={channel === "POS" ? t("nav.listPos") : t("nav.sales")}
        actions={
          <Button onClick={() => navigate(channel === "POS" ? posRoute : "/sales/create")}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {channel === "POS" ? t("nav.pos") : t("nav.addSale")}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Receipt}
            cardBg="bg-app-pos-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={channel === "POS" ? t("nav.listPos") : t("nav.sales")}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
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
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "مجموعة الفروع" : "Location Group"}</label>
              <select
                value={locationGroupId}
                onChange={(e) => {
                  setLocationGroupId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(locationGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.nameAr || g.nameEn : g.nameEn}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المنتج" : "Product"}</label>
              <input
                value={pickedProduct ? (isAr ? pickedProduct.nameAr || pickedProduct.nameEn : pickedProduct.nameEn) : productSearch}
                onChange={(e) => {
                  setPickedProduct(null);
                  setProductSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={isAr ? "أي منتج" : "Any product"}
                className={cn(inputClass, "w-full")}
              />
              {productSearch && !pickedProduct && (productResults?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {productResults!.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPickedProduct(p);
                        setProductSearch("");
                        setPage(1);
                      }}
                      className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                    >
                      {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الخدمة" : "Service"}</label>
              <input
                value={pickedService ? (isAr ? pickedService.nameAr || pickedService.nameEn : pickedService.nameEn) : serviceSearch}
                onChange={(e) => {
                  setPickedService(null);
                  setServiceSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={isAr ? "أي خدمة" : "Any service"}
                className={cn(inputClass, "w-full")}
              />
              {serviceSearch && !pickedService && (serviceResults?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {serviceResults!.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setPickedService(s);
                        setServiceSearch("");
                        setPage(1);
                      }}
                      className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                    >
                      {isAr ? s.nameAr || s.nameEn : s.nameEn} <span className="ltr-nums text-xs text-slate-400">({s.code})</span>
                    </button>
                  ))}
                </div>
              )}
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
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "تصنيف المنتج" : "Product Category"}</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(productCategories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "تصنيف الخدمة" : "Service Category"}</label>
              <select
                value={serviceCategoryId}
                onChange={(e) => {
                  setServiceCategoryId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(serviceCategories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 border-t border-slate-100 pt-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={onlyHasReturn}
                onChange={(e) => {
                  setOnlyHasReturn(e.target.checked);
                  setPage(1);
                }}
              />
              {isAr ? "لديه مرتجع فقط" : "Only has return"}
            </label>
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
              title={t("nav.sales")}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<Sale>(async (p, l) => {
                  const res = await api.get<ApiSuccess<Sale[]>>("/sales", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((s) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(s)])));
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
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(s)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <RowActions>
                    <RowActionButton icon={Eye} label={isAr ? "الحالة" : "Status"} variant="default" onClick={() => setDetailSaleId(s.id)} />
                    <RowActionLink icon={FileText} label={t("pos.invoice")} variant="default" to={`/invoices/${s.id}`} target="_blank" rel="noopener noreferrer" />
                    <RowActionButton
                      icon={Banknote}
                      label={isAr ? "الدفعات" : "Payments"}
                      variant={s.paymentStatus === "PAID" || s.paymentStatus === "OVERPAID" ? "default" : "success"}
                      onClick={() => setPayingSaleId(s.id)}
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

      {detailSaleId && <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
      {payingSaleId && <SalePaymentsModal saleId={payingSaleId} isAr={isAr} currency={currency} locale={locale} onClose={() => setPayingSaleId(null)} />}
    </div>
  );
}

interface SalePaymentRow {
  id: string;
  amount: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  paymentMethod: { nameEn: string; nameAr: string };
}

interface SalePaymentDetail {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
  payments: SalePaymentRow[];
}

// Reference's "View Payments" + "Add Payment" row actions, converted into one combined modal
// (rather than two separate dropdown items) - a due sale's payment history and its "record a new
// payment" form are naturally one screen, matching the same design-consolidation judgment already
// applied session-wide (e.g. Round 21's Pay Group Due combining Customer Group's due summary +
// payment form in one place). Never touches the sale's own ZATCA-chained fields (icv/invoiceHash/
// ...) - purely additive, a new Payment row plus the paid/due/status recompute already used
// everywhere else in this app.
function SalePaymentsModal({ saleId, isAr, currency, locale, onClose }: { saleId: string; isAr: boolean; currency: string; locale: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: paymentMethods } = usePaymentMethods();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-payments", saleId],
    queryFn: async () => (await api.get<ApiSuccess<SalePaymentDetail>>(`/sales/${saleId}`)).data.data,
  });

  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dueAmount = sale ? Number(sale.dueAmount) : 0;
  if (sale && amount === "" && dueAmount > 0) setAmount(sale.dueAmount);

  const payMutation = useMutation({
    mutationFn: async () =>
      api.post(`/sales/${saleId}/pay-due`, {
        paymentMethodId,
        amount: Number(amount),
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale-payments", saleId] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      setAmount("");
      setPaymentMethodId("");
      setReferenceNumber("");
      setNotes("");
      setError(null);
    },
    onError: (err) =>
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(paymentMethodId && Number(amount) > 0 && Number(amount) <= dueAmount);

  return (
    <Modal title={`${isAr ? "الدفعات" : "Payments"} - ${sale?.invoiceNumber ?? "…"}`} onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-400">{isAr ? "جارٍ التحميل" : "Loading"}</p>}
      {sale && (
        <div className="space-y-4">
          <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{isAr ? "المستحق" : "Due"}</span>
            <span className="ltr-nums font-semibold">{formatMoney(sale.dueAmount, currency, locale)}</span>
          </div>

          {sale.payments.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-start">{isAr ? "التاريخ" : "Date"}</th>
                    <th className="px-2 py-1.5 text-start">{isAr ? "الطريقة" : "Method"}</th>
                    <th className="px-2 py-1.5 text-start">{isAr ? "المرجع" : "Reference"}</th>
                    <th className="px-2 py-1.5 text-end">{isAr ? "المبلغ" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{formatDate(p.paymentDate, locale)}</td>
                      <td className="px-2 py-1.5">{isAr ? p.paymentMethod.nameAr || p.paymentMethod.nameEn : p.paymentMethod.nameEn}</td>
                      <td className="px-2 py-1.5">{p.referenceNumber ?? "—"}</td>
                      <td className="px-2 py-1.5 text-end ltr-nums">{formatMoney(p.amount, currency, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sale.payments.length === 0 && <Alert variant="info">{isAr ? "لا توجد دفعات مسجلة" : "No payments recorded yet"}</Alert>}

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
                <div>
                  <label className={labelClass}>{isAr ? "الرقم المرجعي" : "Reference Number"}</label>
                  <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={cn(inputClass, "w-full")} placeholder={isAr ? "اختياري" : "Optional"} />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t("common.notes")}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "w-full")} rows={2} placeholder={isAr ? "اختياري" : "Optional"} />
              </div>
            </>
          )}

          {error && <Alert variant="danger">{error}</Alert>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose}>
              {t("common.cancel")}
            </Button>
            {dueAmount > 0 && (
              <Button
                type="button"
                fullWidth
                className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800"
                disabled={!canSubmit || payMutation.isPending}
                onClick={() => payMutation.mutate()}
              >
                {payMutation.isPending ? "…" : isAr ? "تسجيل الدفعة" : "Record Payment"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
