import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { Plus, ClipboardList, Undo2, ChevronDown } from "lucide-react";
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
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { useProductPicker, ProductSearchField } from "./productPicker";

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

export default function StockAdjustmentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickAdjustOpen, setQuickAdjustOpen] = useState(false);

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
      <PageHeader
        title={isAr ? "تعديلات المخزون" : "Stock Adjustments"}
        actions={
          can("inventory.adjust") && (
            <Button onClick={() => navigate("/stock-adjustments/create")}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة تعديل مخزون" : "Add Stock Adjustment"}
            </Button>
          )
        }
      />

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

      {can("inventory.adjust") && (
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setQuickAdjustOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-4 text-start text-sm font-semibold text-slate-700"
          >
            {isAr ? "تعديل سريع (منتج واحد)" : "Quick Adjust (single product)"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", quickAdjustOpen && "rotate-180")} strokeWidth={2} aria-hidden />
          </button>
          {quickAdjustOpen && (
            <div className="border-t border-slate-100 p-5 pt-4">
              <AdjustForm isAr={isAr} onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })} />
            </div>
          )}
        </Card>
      )}

      <StockAdjustmentsList isAr={isAr} onDone={() => qc.invalidateQueries({ queryKey: ["inventory-transactions"] })} />

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
  refNo: string | null;
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
        <CardTitle>{isAr ? "قائمة تعديلات المخزون" : "List Stock Adjustments"}</CardTitle>
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
              <Th>{isAr ? "التاريخ" : "Date"}</Th>
              <Th>{isAr ? "الرقم المرجعي" : "Ref No"}</Th>
              <Th>{isAr ? "الفرع" : "Location"}</Th>
              <Th>{isAr ? "نوع التعديل" : "Adjustment Type"}</Th>
              <Th>{isAr ? "الأصناف" : "Items"}</Th>
              <Th>{isAr ? "المبلغ المسترد" : "Amount Recovered"}</Th>
              <Th>{isAr ? "السبب" : "Reason"}</Th>
              <Th>{isAr ? "أضيف بواسطة" : "Added By"}</Th>
              <Th>{isAr ? "الحالة" : "Status"}</Th>
              <Th>{isAr ? "إجراءات" : "Actions"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 align-top hover:bg-slate-50/60">
                <td className="px-4 py-3 text-xs text-slate-500">
                  <span className="ltr-nums">{new Date(a.adjustmentDate).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                </td>
                <td className="px-4 py-3"><span className="ltr-nums">{a.refNo ?? "—"}</span></td>
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
                <td className="px-4 py-3 text-slate-500">{a.notes ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">{a.createdByUser?.fullNameEn ?? "—"}</td>
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
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
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
