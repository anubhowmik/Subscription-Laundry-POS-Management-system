import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { fetchAllRows } from "../../lib/tableExport";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, inputSmClass, selectClass } from "../../components/ui/formClasses";
import { Wallet } from "lucide-react";
import { useCurrentApp } from "../../components/layout/Sidebar";
import type { ReactNode } from "react";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERPAID";

const STATUS_VARIANT: Record<PaymentStatus, "success" | "warning" | "danger" | "info"> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "danger",
  OVERPAID: "info",
};

interface ExpenseCategoryRow {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string | null;
}

interface ExpenseRow {
  id: string;
  expenseNumber: string | null;
  expenseDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  paymentStatus: PaymentStatus;
  isRecurring: boolean;
  category: { nameEn: string; nameAr: string };
  businessLocation: { branchName: string };
  supplier: { nameEn: string; nameAr: string | null } | null;
  createdByUser: { fullNameEn: string };
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();
  // Expenses is shared across POS Laundry/Service POS/Product POS, but linking an expense to a
  // Supplier only makes sense where Suppliers themselves are manageable - Service POS never gets
  // a Suppliers page (suppliers.manage is gated app.pos_laundry/app.pos_product server-side), so
  // the /suppliers search this page's form does would just 403 there. Hide the column/field
  // instead of offering something that silently breaks. See ReportsPage.tsx for the same pattern.
  const hideSupplier = useCurrentApp()?.key === "posService";

  const [formOpen, setFormOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("expenseDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const [categoryFilter, setCategoryFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"" | PaymentStatus>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const activeFilterCount = (categoryFilter ? 1 : 0) + (paymentStatusFilter ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);
  function clearAllFilters() {
    setCategoryFilter("");
    setPaymentStatusFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const { data: filterCategories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api.get<ApiSuccess<ExpenseCategoryRow[]>>("/expenses/categories")).data.data,
  });

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    sortBy,
    sortOrder,
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(paymentStatusFilter ? { paymentStatus: paymentStatusFilter } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };

  const { data: expenses } = useQuery({
    queryKey: ["expenses", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ExpenseRow[]>>("/expenses", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const columns: { key: string; label: string; sortField?: string; render: (e: ExpenseRow) => ReactNode; exportValue: (e: ExpenseRow) => string | number | null }[] = [
    {
      key: "expenseDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "expenseDate",
      render: (e) => <span className="ltr-nums">{new Date(e.expenseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (e) => new Date(e.expenseDate).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "expenseNumber",
      label: isAr ? "الرقم" : "Number",
      sortField: "expenseNumber",
      render: (e) => (
        <>
          <span className="ltr-nums">{e.expenseNumber ?? "-"}</span>
          {e.isRecurring && (
            <Badge variant="neutral" className="ms-1.5">
              {isAr ? "متكرر" : "recurring"}
            </Badge>
          )}
        </>
      ),
      exportValue: (e) => e.expenseNumber,
    },
    {
      key: "category",
      label: isAr ? "الفئة" : "Category",
      render: (e) => (isAr ? e.category.nameAr || e.category.nameEn : e.category.nameEn),
      exportValue: (e) => (isAr ? e.category.nameAr || e.category.nameEn : e.category.nameEn),
    },
    ...(hideSupplier
      ? []
      : [
          {
            key: "supplier",
            label: isAr ? "المورد" : "Supplier",
            render: (e: ExpenseRow) => (e.supplier ? (isAr ? e.supplier.nameAr || e.supplier.nameEn : e.supplier.nameEn) : "-"),
            exportValue: (e: ExpenseRow) => (e.supplier ? (isAr ? e.supplier.nameAr || e.supplier.nameEn : e.supplier.nameEn) : null),
          },
        ]),
    {
      key: "totalAmount",
      label: isAr ? "الإجمالي" : "Total",
      sortField: "totalAmount",
      render: (e) => <span className="ltr-nums">{formatMoney(e.totalAmount, currency, locale)}</span>,
      exportValue: (e) => Number(e.totalAmount),
    },
    {
      key: "paidAmount",
      label: isAr ? "المدفوع" : "Paid",
      sortField: "paidAmount",
      render: (e) => <span className="ltr-nums">{formatMoney(e.paidAmount, currency, locale)}</span>,
      exportValue: (e) => Number(e.paidAmount),
    },
    {
      key: "dueAmount",
      label: isAr ? "المستحق" : "Due",
      sortField: "dueAmount",
      render: (e) => <span className="ltr-nums">{formatMoney(e.dueAmount, currency, locale)}</span>,
      exportValue: (e) => Number(e.dueAmount),
    },
    {
      key: "paymentStatus",
      label: t("common.status"),
      render: (e) => <Badge variant={STATUS_VARIANT[e.paymentStatus]}>{e.paymentStatus}</Badge>,
      exportValue: (e) => e.paymentStatus,
    },
    {
      key: "createdByUser",
      label: isAr ? "بواسطة" : "By",
      render: (e) => e.createdByUser.fullNameEn,
      exportValue: (e) => e.createdByUser.fullNameEn,
    },
  ];
  const columnVisibility = useColumnVisibility("expenses", columns.map((c) => c.key));
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "المصروفات" : "Expenses"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "مصروف جديد" : "New Expense"}</Button>}
      />

      {expenses?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Wallet}
            cardBg="bg-rose-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "المصروفات" : "Expenses"}
            value={String(expenses.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفئة" : "Category"}</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {filterCategories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حالة الدفع" : "Payment Status"}</label>
              <select
                value={paymentStatusFilter}
                onChange={(e) => {
                  setPaymentStatusFilter(e.target.value as typeof paymentStatusFilter);
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
              title={isAr ? "المصروفات" : "Expenses"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<ExpenseRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<ExpenseRow[]>>("/expenses", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((e) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(e)])));
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
              {expenses?.rows.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(e)}
                    </td>
                  ))}
                </tr>
              ))}
              {expenses?.rows.length === 0 && (
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

      {expenses?.meta && expenses.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={expenses.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${expenses.meta.totalPages}`}
        />
      )}

      {formOpen && (
        <ExpenseFormModal
          isAr={isAr}
          hideSupplier={hideSupplier}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["expenses"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ExpenseFormModal({
  isAr,
  hideSupplier,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  hideSupplier: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locations, currentLocationId } = useBusinessLocation();
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api.get<ApiSuccess<ExpenseCategoryRow[]>>("/expenses/categories")).data.data,
  });

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [subtotal, setSubtotal] = useState("");
  const [taxPercent, setTaxPercent] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringIntervalDays, setRecurringIntervalDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createCategoryMutation = useMutation({
    mutationFn: async (nameEn: string) => (await api.post<ApiSuccess<ExpenseCategoryRow>>("/expenses/categories", { nameEn, nameAr: nameEn })).data.data,
    onSuccess: (category) => {
      qc.setQueryData<ExpenseCategoryRow[]>(["expense-categories"], (old) => [...(old ?? []), category]);
      setNewCategoryName("");
      setTimeout(() => setCategoryId(category.id), 0);
    },
  });

  async function runSupplierSearch(value: string) {
    setSupplierSearch(value);
    if (!value.trim()) return setSupplierResults([]);
    const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { search: value, limit: 6 } });
    setSupplierResults(res.data.data);
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/expenses", {
        categoryId,
        businessLocationId,
        supplierId: supplier?.id,
        subtotal: Number(subtotal),
        taxPercent: taxPercent ? Number(taxPercent) : undefined,
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        isRecurring,
        recurringIntervalDays: isRecurring ? Number(recurringIntervalDays) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(categoryId) && Boolean(businessLocationId) && Number(subtotal) > 0;

  return (
    <Modal
      title={isAr ? "مصروف جديد" : "New Expense"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          fullWidth
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? "…" : isAr ? "حفظ المصروف" : "Save Expense"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
          <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inputClass}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "الفئة" : "Category"}</label>
          <div className="flex gap-1">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass}>
              <option value="">{isAr ? "اختر فئة" : "Select a category"}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {isAr ? c.nameAr || c.nameEn : c.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={isAr ? "فئة جديدة" : "New category name"}
              className={inputSmClass + " w-full"}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
              onClick={() => createCategoryMutation.mutate(newCategoryName.trim())}
              className="shrink-0"
            >
              + {isAr ? "إضافة" : "Add"}
            </Button>
          </div>
        </div>

        {!hideSupplier && (
          <div className="relative">
            <label className={labelClass}>{isAr ? "المورد (اختياري)" : "Supplier (optional)"}</label>
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
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {supplierResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSupplier(s);
                      setSupplierResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                  >
                    {isAr ? s.nameAr || s.nameEn : s.nameEn}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "المبلغ" : "Amount"}</label>
            <input type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "نسبة الضريبة %" : "Tax %"}</label>
            <input type="number" min={0} max={100} step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} placeholder="0" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "المبلغ المدفوع" : "Paid Amount"}</label>
          <input type="number" min={0} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className={inputClass} />
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            {isAr ? "مصروف متكرر" : "Recurring expense"}
          </label>
          {isRecurring && (
            <div className="mt-2">
              <label className="mb-1.5 block text-xs text-slate-500">{isAr ? "كل كم يوم" : "Every N days"}</label>
              <input
                type="number"
                min={1}
                value={recurringIntervalDays}
                onChange={(e) => setRecurringIntervalDays(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
