import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";

type PaymentStatus = "PAID" | "PARTIAL" | "DUE" | "OVERPAID";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  DUE: "bg-red-100 text-red-700",
  OVERPAID: "bg-sky-100 text-sky-700",
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "المصروفات" : "Expenses"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "مصروف جديد" : "New Expense"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الرقم" : "Number"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفئة" : "Category"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المورد" : "Supplier"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المدفوع" : "Paid"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المستحق" : "Due"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
            </tr>
          </thead>
          <tbody>
            {expenses?.rows.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(e.expenseDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-2 font-medium">
                  <span className="ltr-nums">{e.expenseNumber ?? "-"}</span>
                  {e.isRecurring && <span className="ms-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{isAr ? "متكرر" : "recurring"}</span>}
                </td>
                <td className="px-4 py-2">{isAr ? e.category.nameAr || e.category.nameEn : e.category.nameEn}</td>
                <td className="px-4 py-2 text-slate-500">{e.supplier ? (isAr ? e.supplier.nameAr || e.supplier.nameEn : e.supplier.nameEn) : "-"}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(e.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(e.paidAmount, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(e.dueAmount, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[e.paymentStatus]}`}>{e.paymentStatus}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">{e.createdByUser.fullNameEn}</td>
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
        </table>
      </div>

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "مصروف جديد" : "New Expense"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inp}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفئة" : "Category"}</label>
            <div className="flex gap-1">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inp}>
                <option value="">{isAr ? "اختر فئة" : "Select a category"}</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 flex gap-1">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={isAr ? "فئة جديدة" : "New category name"}
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                onClick={() => createCategoryMutation.mutate(newCategoryName.trim())}
                className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                + {isAr ? "إضافة" : "Add"}
              </button>
            </div>
          </div>

          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المورد (اختياري)" : "Supplier (optional)"}</label>
            <input
              value={supplier ? (isAr ? supplier.nameAr || supplier.nameEn : supplier.nameEn) : supplierSearch}
              onChange={(e) => {
                setSupplier(null);
                runSupplierSearch(e.target.value);
              }}
              placeholder={isAr ? "ابحث عن مورد..." : "Search for a supplier..."}
              className={inp}
            />
            {supplierResults.length > 0 && !supplier && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {supplierResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSupplier(s);
                      setSupplierResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {isAr ? s.nameAr || s.nameEn : s.nameEn}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ" : "Amount"}</label>
              <input type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نسبة الضريبة %" : "Tax %"}</label>
              <input type="number" min={0} max={100} step="0.01" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} placeholder="0" className={inp} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المدفوع" : "Paid Amount"}</label>
            <input type="number" min={0} step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" className={inp} />
          </div>

          <div className="rounded-lg border border-slate-200 p-2.5">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              {isAr ? "مصروف متكرر" : "Recurring expense"}
            </label>
            {isRecurring && (
              <div className="mt-2">
                <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "كل كم يوم" : "Every N days"}</label>
                <input
                  type="number"
                  min={1}
                  value={recurringIntervalDays}
                  onChange={(e) => setRecurringIntervalDays(e.target.value)}
                  className={inp}
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
          </div>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "حفظ المصروف" : "Save Expense"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
