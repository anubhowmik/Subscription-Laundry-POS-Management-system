import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, inputSmClass } from "../../components/ui/formClasses";
import { Wallet } from "lucide-react";

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

  const [formOpen, setFormOpen] = useState(false);

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ExpenseRow[]>>("/expenses", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

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
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "التاريخ" : "Date"}</Th>
              <Th>{isAr ? "الرقم" : "Number"}</Th>
              <Th>{isAr ? "الفئة" : "Category"}</Th>
              <Th>{isAr ? "المورد" : "Supplier"}</Th>
              <Th>{isAr ? "الإجمالي" : "Total"}</Th>
              <Th>{isAr ? "المدفوع" : "Paid"}</Th>
              <Th>{isAr ? "المستحق" : "Due"}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{isAr ? "بواسطة" : "By"}</Th>
            </tr>
          </THead>
          <tbody>
            {expenses?.rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(e.expenseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-3 font-medium">
                  <span className="ltr-nums">{e.expenseNumber ?? "-"}</span>
                  {e.isRecurring && (
                    <Badge variant="neutral" className="ms-1.5">
                      {isAr ? "متكرر" : "recurring"}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">{isAr ? e.category.nameAr || e.category.nameEn : e.category.nameEn}</td>
                <td className="px-4 py-3 text-slate-500">{e.supplier ? (isAr ? e.supplier.nameAr || e.supplier.nameEn : e.supplier.nameEn) : "-"}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(e.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(e.paidAmount, currency, locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(e.dueAmount, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[e.paymentStatus]}>{e.paymentStatus}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">{e.createdByUser.fullNameEn}</td>
              </tr>
            ))}
            {expenses?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableContainer>

      {formOpen && (
        <ExpenseFormModal
          isAr={isAr}
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

function ExpenseFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
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
