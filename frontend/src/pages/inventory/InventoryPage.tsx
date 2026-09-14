import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { X } from "lucide-react";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/cn";
import { fetchAllRows } from "../../lib/tableExport";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, selectClass, inputSmClass } from "../../components/ui/formClasses";
import { ClipboardList, PackageCheck, XCircle, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

interface ProductPick {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
}

interface TransactionRow {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  referenceType: string | null;
  note: string | null;
  createdAt: string;
  product: { nameEn: string; nameAr: string; sku: string };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
}

const TYPE_LABEL: Record<string, { en: string; ar: string; cls: string }> = {
  STOCK_IN: { en: "Stock In", ar: "إدخال مخزون", cls: "bg-green-100 text-green-700" },
  STOCK_OUT: { en: "Stock Out", ar: "إخراج مخزون", cls: "bg-red-100 text-red-700" },
  SALE: { en: "Sale", ar: "بيع", cls: "bg-sky-100 text-sky-700" },
  SALE_RETURN: { en: "Return", ar: "إرجاع", cls: "bg-amber-100 text-amber-700" },
  ADJUSTMENT: { en: "Adjustment", ar: "تعديل", cls: "bg-purple-100 text-purple-700" },
  TRANSFER_IN: { en: "Transfer In", ar: "تحويل وارد", cls: "bg-teal-100 text-teal-700" },
  TRANSFER_OUT: { en: "Transfer Out", ar: "تحويل صادر", cls: "bg-orange-100 text-orange-700" },
};

export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"ADJUST" | "TRANSFER" | "GROUP_ADJUST">("ADJUST");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Sortable column header matching the reference's DataTable - backend only whitelists
  // "createdAt" for this list (inventory.service.ts's listTransactions).
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const activeFilterCount = (typeFilter ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);
  function clearAllFilters() {
    setTypeFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    sortBy,
    sortOrder,
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };

  const { data } = useQuery({
    queryKey: ["inventory-transactions", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<TransactionRow[]>>("/inventory/transactions", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const columns: { key: string; label: string; sortField?: string; render: (r: TransactionRow) => ReactNode; exportValue: (r: TransactionRow) => string | number | null }[] = [
    {
      key: "date",
      label: isAr ? "التاريخ" : "Date",
      sortField: "createdAt",
      render: (r) => <span className="ltr-nums">{new Date(r.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (r) => new Date(r.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "type",
      label: isAr ? "النوع" : "Type",
      render: (r) => (
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TYPE_LABEL[r.type]?.cls ?? "bg-slate-100 text-slate-600")}>
          {isAr ? TYPE_LABEL[r.type]?.ar ?? r.type : TYPE_LABEL[r.type]?.en ?? r.type}
        </span>
      ),
      exportValue: (r) => (isAr ? TYPE_LABEL[r.type]?.ar ?? r.type : TYPE_LABEL[r.type]?.en ?? r.type),
    },
    {
      key: "product",
      label: isAr ? "المنتج" : "Product",
      render: (r) => (
        <>
          {isAr ? r.product.nameAr || r.product.nameEn : r.product.nameEn} <span className="ltr-nums text-xs text-slate-400">({r.product.sku})</span>
        </>
      ),
      exportValue: (r) => `${isAr ? r.product.nameAr || r.product.nameEn : r.product.nameEn} (${r.product.sku})`,
    },
    {
      key: "branch",
      label: isAr ? "الفرع" : "Branch",
      render: (r) => r.businessLocation.branchName,
      exportValue: (r) => r.businessLocation.branchName,
    },
    {
      key: "quantity",
      label: isAr ? "الكمية" : "Qty",
      render: (r) => (
        <span className={cn("font-medium", Number(r.quantity) < 0 ? "text-red-600" : "text-green-600")}>
          <span className="ltr-nums">
            {Number(r.quantity) > 0 ? "+" : ""}
            {r.quantity}
          </span>
        </span>
      ),
      exportValue: (r) => Number(r.quantity),
    },
    {
      key: "balanceAfter",
      label: isAr ? "الرصيد بعد" : "Balance After",
      render: (r) => <span className="ltr-nums">{r.balanceAfter}</span>,
      exportValue: (r) => Number(r.balanceAfter),
    },
    {
      key: "note",
      label: isAr ? "ملاحظة" : "Note",
      render: (r) => r.note ?? "—",
      exportValue: (r) => r.note,
    },
    {
      key: "by",
      label: isAr ? "بواسطة" : "By",
      render: (r) => r.createdByUser?.fullNameEn ?? "—",
      exportValue: (r) => r.createdByUser?.fullNameEn ?? null,
    },
  ];

  const columnVisibility = useColumnVisibility(
    "inventory",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "المخزون" : "Inventory"} />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={ClipboardList}
            cardBg="bg-app-pos-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "حركات المخزون" : "Inventory Transactions"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      {(can("inventory.adjust") || can("inventory.transfer")) && (
        <Card className="p-5">
          <div className="mb-4 flex gap-6 border-b border-slate-100">
            {can("inventory.adjust") && (
              <button
                onClick={() => setTab("ADJUST")}
                className={cn(
                  "pb-2.5 text-sm font-semibold transition-colors",
                  tab === "ADJUST" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {isAr ? "تعديل المخزون" : "Adjust Stock"}
              </button>
            )}
            {can("inventory.transfer") && (
              <button
                onClick={() => setTab("TRANSFER")}
                className={cn(
                  "pb-2.5 text-sm font-semibold transition-colors",
                  tab === "TRANSFER" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {isAr ? "تحويل مخزون" : "Transfer Stock"}
              </button>
            )}
            {can("inventory.adjust") && (
              <button
                onClick={() => setTab("GROUP_ADJUST")}
                className={cn(
                  "pb-2.5 text-sm font-semibold transition-colors",
                  tab === "GROUP_ADJUST" ? "border-b-2 border-sky-600 text-sky-600" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {isAr ? "تعديل مجمّع" : "Group Adjustment"}
              </button>
            )}
          </div>

          {tab === "ADJUST" && can("inventory.adjust") && (
            <AdjustForm isAr={isAr} onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })} />
          )}
          {tab === "TRANSFER" && can("inventory.transfer") && (
            <ShipTransferForm
              isAr={isAr}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
                qc.invalidateQueries({ queryKey: ["stock-transfers"] });
              }}
            />
          )}
          {tab === "GROUP_ADJUST" && (
            <GroupAdjustForm
              isAr={isAr}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
                qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
              }}
            />
          )}
        </Card>
      )}

      {tab === "TRANSFER" && can("inventory.transfer") && (
        <PendingTransfers
          isAr={isAr}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
            qc.invalidateQueries({ queryKey: ["stock-transfers"] });
          }}
        />
      )}

      {tab === "GROUP_ADJUST" && (
        <StockAdjustmentsList
          isAr={isAr}
          onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })}
        />
      )}

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "النوع" : "Type"}</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {Object.entries(TYPE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {isAr ? label.ar : label.en}
                  </option>
                ))}
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
              title={isAr ? "حركات المخزون" : "Inventory Transactions"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<TransactionRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<TransactionRow[]>>("/inventory/transactions", { params: { ...filterParams, page: p, limit: l } });
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
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-400">
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
    </div>
  );
}

function useProductPicker() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductPick[]>([]);
  const [picked, setPicked] = useState<ProductPick | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<ProductPick[]>>("/products", { params: { search: value, limit: 8 } });
    setResults(res.data.data);
  }

  function select(p: ProductPick) {
    setPicked(p);
    setSearch("");
    setResults([]);
  }

  return { search, results, picked, select, runSearch, reset: () => { setSearch(""); setResults([]); setPicked(null); } };
}

function ProductSearchField({ isAr, picker }: { isAr: boolean; picker: ReturnType<typeof useProductPicker> }) {
  return (
    <div className="relative">
      <input
        value={picker.picked ? (isAr ? picker.picked.nameAr || picker.picked.nameEn : picker.picked.nameEn) : picker.search}
        onChange={(e) => picker.runSearch(e.target.value)}
        placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
        className={inputClass}
      />
      {picker.results.length > 0 && !picker.picked && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
          {picker.results.map((p) => (
            <button
              key={p.id}
              onClick={() => picker.select(p)}
              className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
            >
              {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const picker = useProductPicker();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [quantityChange, setQuantityChange] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/adjust", { productId: picker.picked!.id, businessLocationId, quantityChange: Number(quantityChange), reason }),
    onSuccess: () => {
      picker.reset();
      setQuantityChange("");
      setReason("");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picker.picked) && businessLocationId && Number(quantityChange) !== 0 && reason.trim().length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className={labelClass}>{isAr ? "المنتج" : "Product"}</label>
        <ProductSearchField isAr={isAr} picker={picker} />
      </div>
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
      <div>
        <label className={labelClass}>{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
        <input type="number" value={quantityChange} onChange={(e) => setQuantityChange(e.target.value)} placeholder="-5" className={cn(inputClass, "ltr-nums")} />
      </div>
      <div className="sm:col-span-3">
        <label className={labelClass}>{isAr ? "السبب" : "Reason"}</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isAr ? "جرد، تلف، ..." : "Stock count, damage, ..."} className={inputClass} />
      </div>
      <div className="flex items-end">
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "تطبيق" : "Apply"}
        </Button>
      </div>
      {error && (
        <Alert variant="danger" className="sm:col-span-4">
          {error}
        </Alert>
      )}
    </div>
  );
}

function ShipTransferForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const picker = useProductPicker();
  const [fromId, setFromId] = useState(currentLocationId ?? "");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [shipNote, setShipNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/transfers", {
        productId: picker.picked!.id,
        fromBusinessLocationId: fromId,
        toBusinessLocationId: toId,
        quantity: Number(quantity),
        driverName: driverName || undefined,
        vehicleNumber: vehicleNumber || undefined,
        shipNote: shipNote || undefined,
      }),
    onSuccess: () => {
      picker.reset();
      setQuantity("");
      setDriverName("");
      setVehicleNumber("");
      setShipNote("");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picker.picked) && fromId && toId && fromId !== toId && Number(quantity) > 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className={labelClass}>{isAr ? "المنتج" : "Product"}</label>
        <ProductSearchField isAr={isAr} picker={picker} />
      </div>
      <div>
        <label className={labelClass}>{isAr ? "من فرع" : "From"}</label>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.branchName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>{isAr ? "إلى فرع" : "To"}</label>
        <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectClass}>
          <option value="">{isAr ? "اختر" : "Select"}</option>
          {locations.filter((l) => l.id !== fromId).map((l) => (
            <option key={l.id} value={l.id}>
              {l.branchName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>{isAr ? "الكمية" : "Quantity"}</label>
        <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={cn(inputClass, "ltr-nums")} />
      </div>
      <div>
        <label className={labelClass}>{isAr ? "اسم السائق" : "Driver Name"}</label>
        <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{isAr ? "رقم المركبة" : "Vehicle Number"}</label>
        <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className={cn(inputClass, "ltr-nums")} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{isAr ? "ملاحظة الشحن" : "Ship Note"}</label>
        <input value={shipNote} onChange={(e) => setShipNote(e.target.value)} className={inputClass} />
      </div>
      <div className="flex items-end">
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "شحن التحويل" : "Ship Transfer"}
        </Button>
      </div>
      {error && (
        <Alert variant="danger" className="sm:col-span-4">
          {error}
        </Alert>
      )}
    </div>
  );
}

interface StockTransferRow {
  id: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  fromBusinessLocationId: string;
  toBusinessLocationId: string;
  quantitySent: string;
  quantityReceived: string | null;
  driverName: string | null;
  vehicleNumber: string | null;
  shipNote: string | null;
  receiveNote: string | null;
  shippedAt: string;
  receivedAt: string | null;
  product: { nameEn: string; nameAr: string; sku: string };
  fromBusinessLocation: { branchName: string };
  toBusinessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
  receivedByUser: { fullNameEn: string } | null;
}

function PendingTransfers({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations } = useBusinessLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["stock-transfers", "IN_TRANSIT"],
    queryFn: async () => (await api.get<ApiSuccess<StockTransferRow[]>>("/inventory/transfers", { params: { status: "IN_TRANSIT", limit: 50 } })).data.data,
  });

  const locationIds = new Set(locations.map((l) => l.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAr ? "التحويلات المعلقة" : "Pending Transfers"}</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "المنتج" : "Product"}</Th>
              <Th>{isAr ? "من" : "From"}</Th>
              <Th>{isAr ? "إلى" : "To"}</Th>
              <Th>{isAr ? "الكمية المرسلة" : "Qty Sent"}</Th>
              <Th>{isAr ? "السائق" : "Driver"}</Th>
              <Th>{isAr ? "تاريخ الشحن" : "Shipped"}</Th>
              <Th>{isAr ? "إجراءات" : "Actions"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.map((tr) => (
              <TransferRow
                key={tr.id}
                transfer={tr}
                isAr={isAr}
                canReceive={locationIds.has(tr.toBusinessLocationId)}
                canCancel={locationIds.has(tr.fromBusinessLocationId)}
                expanded={expandedId === tr.id}
                onToggle={() => setExpandedId(expandedId === tr.id ? null : tr.id)}
                onDone={() => {
                  setExpandedId(null);
                  onDone();
                }}
              />
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? "لا توجد تحويلات معلقة" : "No pending transfers"}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

function TransferRow({
  transfer,
  isAr,
  canReceive,
  canCancel,
  expanded,
  onToggle,
  onDone,
}: {
  transfer: StockTransferRow;
  isAr: boolean;
  canReceive: boolean;
  canCancel: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [quantityReceived, setQuantityReceived] = useState(transfer.quantitySent);
  const [receiveNote, setReceiveNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const receiveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/inventory/transfers/${transfer.id}/receive`, {
        quantityReceived: Number(quantityReceived),
        receiveNote: receiveNote || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/inventory/transfers/${transfer.id}/cancel`),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <>
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
        <td className="px-4 py-3">
          {isAr ? transfer.product.nameAr || transfer.product.nameEn : transfer.product.nameEn}{" "}
          <span className="ltr-nums text-xs text-slate-400">({transfer.product.sku})</span>
        </td>
        <td className="px-4 py-3">{transfer.fromBusinessLocation.branchName}</td>
        <td className="px-4 py-3">{transfer.toBusinessLocation.branchName}</td>
        <td className="px-4 py-3"><span className="ltr-nums">{transfer.quantitySent}</span></td>
        <td className="px-4 py-3 text-slate-500">{transfer.driverName ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(transfer.shippedAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
        <td className="px-4 py-3">
          <RowActions>
            {canReceive && <RowActionButton icon={PackageCheck} label={isAr ? "استلام" : "Receive"} variant="success" onClick={onToggle} />}
            {canCancel && (
              <RowActionButton
                icon={XCircle}
                label={isAr ? "إلغاء" : "Cancel"}
                variant="danger"
                disabled={cancelMutation.isPending}
                onClick={async () => {
                  if (await confirmAction({ message: isAr ? "إلغاء هذا التحويل؟" : "Cancel this transfer?", danger: true })) cancelMutation.mutate();
                }}
              />
            )}
          </RowActions>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelClass}>{isAr ? "الكمية المستلمة" : "Quantity Received"}</label>
                <input type="number" min={0} value={quantityReceived} onChange={(e) => setQuantityReceived(e.target.value)} className={cn(inputClass, "ltr-nums")} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{isAr ? "ملاحظة الاستلام" : "Receive Note"}</label>
                <input value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} className={inputClass} />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setError(null);
                    receiveMutation.mutate();
                  }}
                  disabled={receiveMutation.isPending || Number(quantityReceived) < 0}
                  fullWidth
                >
                  {receiveMutation.isPending ? "…" : isAr ? "تأكيد الاستلام" : "Confirm Receipt"}
                </Button>
              </div>
              {error && (
                <Alert variant="danger" className="sm:col-span-4">
                  {error}
                </Alert>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface AdjLine {
  key: string;
  product: ProductPick;
  quantityChange: string;
  note: string;
}

function GroupAdjustForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [lossType, setLossType] = useState<"NORMAL" | "ABNORMAL">("NORMAL");
  const [totalAmountRecovered, setTotalAmountRecovered] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjLine[]>([]);
  const picker = useProductPicker();
  const [error, setError] = useState<string | null>(null);

  function addLine() {
    if (!picker.picked) return;
    setLines((prev) => [...prev, { key: `${picker.picked!.id}-${prev.length}`, product: picker.picked!, quantityChange: "", note: "" }]);
    picker.reset();
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<AdjLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory/adjustments", {
        businessLocationId,
        lossType,
        totalAmountRecovered: lossType === "ABNORMAL" && totalAmountRecovered ? Number(totalAmountRecovered) : undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ productId: l.product.id, quantityChange: Number(l.quantityChange), note: l.note || undefined })),
      }),
    onSuccess: () => {
      setLines([]);
      setNotes("");
      setTotalAmountRecovered("");
      setLossType("NORMAL");
      setError(null);
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && lines.length > 0 && lines.every((l) => Number(l.quantityChange) !== 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
        <div>
          <label className={labelClass}>{isAr ? "نوع الفقد" : "Loss Type"}</label>
          <select value={lossType} onChange={(e) => setLossType(e.target.value as "NORMAL" | "ABNORMAL")} className={selectClass}>
            <option value="NORMAL">{isAr ? "عادي" : "Normal"}</option>
            <option value="ABNORMAL">{isAr ? "غير عادي" : "Abnormal"}</option>
          </select>
        </div>
        {lossType === "ABNORMAL" && (
          <div>
            <label className={labelClass}>{isAr ? "المبلغ المسترد" : "Amount Recovered"}</label>
            <input type="number" min={0} value={totalAmountRecovered} onChange={(e) => setTotalAmountRecovered(e.target.value)} className={cn(inputClass, "ltr-nums")} />
          </div>
        )}
        <div className={lossType === "ABNORMAL" ? "" : "sm:col-span-2"}>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <ProductSearchField isAr={isAr} picker={picker} />
          </div>
          <Button variant="secondary" onClick={addLine} disabled={!picker.picked}>
            + {isAr ? "إضافة سطر" : "Add Line"}
          </Button>
        </div>

        {lines.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-start">{isAr ? "المنتج" : "Product"}</th>
                <th className="px-2 py-1.5 text-start">{isAr ? "التغيير" : "Change"}</th>
                <th className="px-2 py-1.5 text-start">{isAr ? "ملاحظة" : "Note"}</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    {isAr ? l.product.nameAr || l.product.nameEn : l.product.nameEn}{" "}
                    <span className="ltr-nums text-xs text-slate-400">({l.product.sku})</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={l.quantityChange}
                      onChange={(e) => updateLine(l.key, { quantityChange: e.target.value })}
                      placeholder="-2"
                      className={cn(inputSmClass, "ltr-nums w-24")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={l.note} onChange={(e) => updateLine(l.key, { note: e.target.value })} className={cn(inputSmClass, "w-full")} />
                  </td>
                  <td className="px-2 py-1.5 text-end">
                    <button onClick={() => removeLine(l.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
                      <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lines.length === 0 && <p className="py-3 text-center text-xs text-slate-400">{isAr ? "أضف منتجات للتعديل" : "Add products to adjust"}</p>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      <Button
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "تأكيد التعديل" : "Confirm Adjustment"}
      </Button>
    </div>
  );
}

interface StockAdjustmentItemRow {
  id: string;
  productId: string;
  quantityChange: string;
  note: string | null;
  product: { nameEn: string; nameAr: string; sku: string };
}

interface StockAdjustmentRow {
  id: string;
  adjustmentNumber: string | null;
  adjustmentDate: string;
  lossType: "NORMAL" | "ABNORMAL";
  totalAmountRecovered: string;
  status: "CONFIRMED" | "REVERSED";
  notes: string | null;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
  items: StockAdjustmentItemRow[];
}

function StockAdjustmentsList({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: async () => (await api.get<ApiSuccess<StockAdjustmentRow[]>>("/inventory/adjustments", { params: { limit: 30 } })).data.data,
  });

  const reverseMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/inventory/adjustments/${id}/reverse`),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      onDone();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAr ? "التعديلات المجمّعة" : "Grouped Adjustments"}</CardTitle>
        {error && (
          <Alert variant="danger" className="mt-2">
            {error}
          </Alert>
        )}
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "الرقم" : "Number"}</Th>
              <Th>{isAr ? "الفرع" : "Branch"}</Th>
              <Th>{isAr ? "نوع الفقد" : "Loss Type"}</Th>
              <Th>{isAr ? "الأصناف" : "Items"}</Th>
              <Th>{isAr ? "المسترد" : "Recovered"}</Th>
              <Th>{isAr ? "الحالة" : "Status"}</Th>
              <Th>{isAr ? "إجراءات" : "Actions"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{a.adjustmentNumber}</span></td>
                <td className="px-4 py-3">{a.businessLocation.branchName}</td>
                <td className="px-4 py-3">
                  <Badge variant={a.lossType === "ABNORMAL" ? "danger" : "neutral"}>
                    {a.lossType === "ABNORMAL" ? (isAr ? "غير عادي" : "Abnormal") : isAr ? "عادي" : "Normal"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {a.items.map((it) => (
                    <div key={it.id}>
                      {isAr ? it.product.nameAr || it.product.nameEn : it.product.nameEn}{" "}
                      <span className={cn("ltr-nums font-medium", Number(it.quantityChange) < 0 ? "text-red-600" : "text-green-600")}>
                        {Number(it.quantityChange) > 0 ? "+" : ""}
                        {it.quantityChange}
                      </span>
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3"><span className="ltr-nums">{a.totalAmountRecovered}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={a.status === "CONFIRMED" ? "success" : "neutral"}>
                    {a.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معكوس" : "Reversed"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {a.status === "CONFIRMED" && can("inventory.reverse_adjustment") && (
                    <RowActions>
                      <RowActionButton
                        icon={Undo2}
                        label={isAr ? "عكس" : "Reverse"}
                        variant="danger"
                        disabled={reverseMutation.isPending}
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? "عكس هذا التعديل؟" : "Reverse this adjustment?", danger: true })) reverseMutation.mutate(a.id);
                        }}
                      />
                    </RowActions>
                  )}
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? "لا توجد تعديلات" : "No adjustments"}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
