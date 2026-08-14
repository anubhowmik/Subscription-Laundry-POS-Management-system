import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, Customer, PaginationMeta } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePriceLists } from "../../api/posApi";
import { roundMoney } from "../../stores/posStore";
import { useAuth } from "../../contexts/AuthContext";

const schema = z.object({
  nameEn: z.string().min(1, "Required"),
  nameAr: z.string().optional(),
  phone: z.string().regex(/^(?:\+?966|0)5\d{8}$/, "Invalid Saudi phone number"),
  email: z.string().email().optional().or(z.literal("")),
  openingBalance: z.coerce.number().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function CustomersPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["customers", search, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Customer[]>>("/customers", { params: { search, page, limit: 20 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await api.post<ApiSuccess<Customer>>("/customers", values);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowForm(false);
      reset();
      setServerError(null);
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  const { data: priceLists } = usePriceLists();
  const assignPriceListMutation = useMutation({
    mutationFn: async ({ id, priceListId }: { id: string; priceListId: string | null }) =>
      api.put(`/customers/${id}`, { priceListId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      api.put(`/customers/${id}/approve`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  const [adjustingCustomer, setAdjustingCustomer] = useState<Customer | null>(null);
  const [adjustingCashbackCustomer, setAdjustingCashbackCustomer] = useState<Customer | null>(null);
  const [applyCreditCustomer, setApplyCreditCustomer] = useState<Customer | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("customers.title")}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {t("customers.addCustomer")}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{t("customers.code")}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{t("common.phone")}</th>
              <th className="px-4 py-2 text-start">{t("customers.group")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "قائمة الأسعار" : "Price List"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "النقاط" : "Points"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الكاش باك" : "Cashback"}</th>
              <th className="px-4 py-2 text-start">{t("customers.balance")}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{c.code}</span></td>
                <td className="px-4 py-2">{isAr ? c.nameAr || c.nameEn : c.nameEn}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{c.phone}</span></td>
                <td className="px-4 py-2">{c.customerGroup ? (isAr ? c.customerGroup.nameAr : c.customerGroup.nameEn) : "-"}</td>
                <td className="px-4 py-2">
                  <select
                    value={c.priceListId ?? ""}
                    onChange={(e) => assignPriceListMutation.mutate({ id: c.id, priceListId: e.target.value || null })}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-sky-400 focus:outline-none"
                  >
                    <option value="">{isAr ? "بلا" : "None"}</option>
                    {priceLists?.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => setAdjustingCustomer(c)} className="ltr-nums rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                    {c.rewardPoints}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => setAdjustingCashbackCustomer(c)} className="ltr-nums rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                    {formatMoney(c.cashBack, currency, locale)}
                  </button>
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(c.balance, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                    </span>
                    {c.approvalStatus !== "APPROVED" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.approvalStatus === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {c.approvalStatus === "PENDING" ? (isAr ? "بانتظار الموافقة" : "Pending approval") : isAr ? "مرفوض" : "Rejected"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Number(c.balance) < 0 && (
                      <button
                        onClick={() => setApplyCreditCustomer(c)}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        {isAr ? "تطبيق الرصيد" : "Apply Credit"}
                      </button>
                    )}
                    {c.approvalStatus === "PENDING" && can("customers.approve") && (
                      <>
                        <button
                          onClick={() => approvalMutation.mutate({ id: c.id, status: "APPROVED" })}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          {isAr ? "موافقة" : "Approve"}
                        </button>
                        <button
                          onClick={() => approvalMutation.mutate({ id: c.id, status: "REJECTED" })}
                          className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          {isAr ? "رفض" : "Reject"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            {t("common.page")} {page} {t("common.of")} {data.meta.totalPages}
          </span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-800">{t("customers.addCustomer")}</h2>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("customers.nameEn")}</label>
                <input {...register("nameEn")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                {errors.nameEn && <p className="mt-1 text-xs text-red-600">{errors.nameEn.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("customers.nameAr")}</label>
                <input {...register("nameAr")} dir="rtl" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.phone")}</label>
                <input {...register("phone")} placeholder="05XXXXXXXX" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.email")}</label>
                <input {...register("email")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
                <input type="number" step="0.01" {...register("openingBalance")} placeholder="0.00" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
              </div>

              {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    reset();
                    setServerError(null);
                  }}
                  className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adjustingCustomer && (
        <AdjustPointsModal
          isAr={isAr}
          customer={adjustingCustomer}
          onClose={() => setAdjustingCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setAdjustingCustomer(null);
          }}
        />
      )}

      {adjustingCashbackCustomer && (
        <AdjustCashbackModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          customer={adjustingCashbackCustomer}
          onClose={() => setAdjustingCashbackCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setAdjustingCashbackCustomer(null);
          }}
        />
      )}

      {applyCreditCustomer && (
        <ApplyCreditModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          customer={applyCreditCustomer}
          onClose={() => setApplyCreditCustomer(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setApplyCreditCustomer(null);
          }}
        />
      )}
    </div>
  );
}

interface DueSale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  totalAmount: string;
  dueAmount: string;
  paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
}

function ApplyCreditModal({
  isAr,
  currency,
  locale,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const availableCredit = Number(customer.balance) < 0 ? -Number(customer.balance) : 0;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["customer-profile", customer.id],
    queryFn: async () => (await api.get<ApiSuccess<{ sales: DueSale[] }>>(`/customers/${customer.id}/profile`)).data.data,
  });

  const dueSales = (profile?.sales ?? [])
    .filter((s) => Number(s.dueAmount) > 0)
    .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());

  const totalEntered = Object.values(amounts).reduce((sum, v) => sum + (Number(v) || 0), 0);

  function autoApplyOldestFirst() {
    // Rounded at each step (not just at display) - remaining accumulates via repeated
    // subtraction across sales, which can drift in raw float even though every input here is
    // already a clean 2-decimal amount. Same class of bug as the POS payment auto-fill.
    let remaining = roundMoney(availableCredit);
    const next: Record<string, string> = {};
    for (const sale of dueSales) {
      if (remaining <= 0) break;
      const amount = roundMoney(Math.min(remaining, Number(sale.dueAmount)));
      next[sale.id] = amount.toFixed(2);
      remaining = roundMoney(remaining - amount);
    }
    setAmounts(next);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const entries = Object.entries(amounts).filter(([, v]) => Number(v) > 0);
      for (const [saleId, amount] of entries) {
        await api.post(`/customers/${customer.id}/apply-credit`, { saleId, amount: Number(amount) });
      }
      onSaved();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{isAr ? "تطبيق الرصيد" : "Apply Store Credit"}</h3>
            <p className="text-xs text-slate-400">
              {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد المتاح" : "Available"}:{" "}
              <span className="ltr-nums">{formatMoney(availableCredit, currency, locale)}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <button
          onClick={autoApplyOldestFirst}
          disabled={dueSales.length === 0}
          className="mb-3 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {isAr ? "تطبيق تلقائي (الأقدم أولاً)" : "Auto-apply oldest first"}
        </button>

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {dueSales.map((sale) => (
            <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
              <div className="min-w-0">
                <p className="ltr-nums truncate text-sm font-medium text-slate-700">{sale.invoiceNumber}</p>
                <p className="text-xs text-slate-400">
                  {isAr ? "المستحق" : "Due"}: <span className="ltr-nums">{formatMoney(sale.dueAmount, currency, locale)}</span>
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={Number(sale.dueAmount)}
                value={amounts[sale.id] ?? ""}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [sale.id]: e.target.value }))}
                placeholder="0.00"
                className="ltr-nums w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          ))}
          {dueSales.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{isAr ? "لا توجد فواتير مستحقة" : "No outstanding invoices"}</p>}
        </div>

        <div className="mt-3 flex justify-between text-sm">
          <span className="text-slate-500">{isAr ? "الإجمالي المطبق" : "Total to apply"}</span>
          <span className={`ltr-nums font-semibold ${totalEntered > availableCredit ? "text-red-600" : "text-slate-800"}`}>
            {formatMoney(totalEntered, currency, locale)}
          </span>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting || totalEntered <= 0 || totalEntered > availableCredit}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? "…" : isAr ? "تطبيق" : "Apply"}
        </button>
      </div>
    </div>
  );
}

function AdjustPointsModal({
  isAr,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => api.post(`/loyalty/customers/${customer.id}/adjust`, { points: Number(points), note }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Number(points) !== 0 && Number.isInteger(Number(points)) && note.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{isAr ? "تعديل النقاط" : "Adjust Points"}</h3>
            <p className="text-xs text-slate-400">
              {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}: {customer.rewardPoints}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
            <input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="-50" className={inp} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "السبب" : "Reason"}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة ولاء..." : "Correction, goodwill bonus..."} className={inp} />
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
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

function AdjustCashbackModal({
  isAr,
  currency,
  locale,
  customer,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => api.post(`/cashback/customers/${customer.id}/adjust`, { amount: Number(amount), note }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Number(amount) !== 0 && note.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{isAr ? "تعديل الكاش باك" : "Adjust Cashback"}</h3>
            <p className="text-xs text-slate-400">
              {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}: {formatMoney(customer.cashBack, currency, locale)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25.00" className={inp} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "السبب" : "Reason"}</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة..." : "Correction, goodwill grant..."} className={inp} />
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
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
