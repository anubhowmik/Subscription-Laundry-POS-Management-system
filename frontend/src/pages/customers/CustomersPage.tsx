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
import { cn } from "../../lib/cn";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePriceLists } from "../../api/posApi";
import { roundMoney } from "../../stores/posStore";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { labelClass, inputClass, inputSmClass, errorTextClass } from "../../components/ui/formClasses";
import { Users } from "lucide-react";

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
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema) });

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

  function closeForm() {
    setShowForm(false);
    reset();
    setServerError(null);
  }

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
    <div className="space-y-6">
      <PageHeader
        title={t("customers.title")}
        actions={<Button onClick={() => setShowForm(true)}>+ {t("customers.addCustomer")}</Button>}
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Users}
            cardBg="bg-app-users-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={t("customers.title")}
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
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("customers.code")}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{t("customers.group")}</Th>
              <Th>{isAr ? "قائمة الأسعار" : "Price List"}</Th>
              <Th>{isAr ? "النقاط" : "Points"}</Th>
              <Th>{isAr ? "الكاش باك" : "Cashback"}</Th>
              <Th>{t("customers.balance")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{c.code}</span></td>
                <td className="px-4 py-3">{isAr ? c.nameAr || c.nameEn : c.nameEn}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{c.phone}</span></td>
                <td className="px-4 py-3">{c.customerGroup ? (isAr ? c.customerGroup.nameAr : c.customerGroup.nameEn) : "-"}</td>
                <td className="px-4 py-3">
                  <select
                    value={c.priceListId ?? ""}
                    onChange={(e) => assignPriceListMutation.mutate({ id: c.id, priceListId: e.target.value || null })}
                    className={inputSmClass}
                  >
                    <option value="">{isAr ? "بلا" : "None"}</option>
                    {priceLists?.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setAdjustingCustomer(c)} className="ltr-nums rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-200">
                    {c.rewardPoints}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => setAdjustingCashbackCustomer(c)} className="ltr-nums rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-200">
                    {formatMoney(c.cashBack, currency, locale)}
                  </button>
                </td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(c.balance, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={c.status === "ACTIVE" ? "success" : "neutral"}>
                      {c.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                    </Badge>
                    {c.approvalStatus !== "APPROVED" && (
                      <Badge variant={c.approvalStatus === "PENDING" ? "warning" : "danger"}>
                        {c.approvalStatus === "PENDING" ? (isAr ? "بانتظار الموافقة" : "Pending approval") : isAr ? "مرفوض" : "Rejected"}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Number(c.balance) < 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-200"
                        onClick={() => setApplyCreditCustomer(c)}
                      >
                        {isAr ? "تطبيق الرصيد" : "Apply Credit"}
                      </Button>
                    )}
                    {c.approvalStatus === "PENDING" && can("customers.approve") && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-200"
                          onClick={() => approvalMutation.mutate({ id: c.id, status: "APPROVED" })}
                        >
                          {isAr ? "موافقة" : "Approve"}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => approvalMutation.mutate({ id: c.id, status: "REJECTED" })}>
                          {isAr ? "رفض" : "Reject"}
                        </Button>
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
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}

      {showForm && (
        <Modal title={t("customers.addCustomer")} onClose={closeForm} size="md">
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div>
              <label className={labelClass}>{t("customers.nameEn")}</label>
              <input {...register("nameEn")} className={inputClass} />
              {errors.nameEn && <p className={errorTextClass}>{errors.nameEn.message}</p>}
            </div>
            <div>
              <label className={labelClass}>{t("customers.nameAr")}</label>
              <input {...register("nameAr")} dir="rtl" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t("common.phone")}</label>
              <input {...register("phone")} placeholder="05XXXXXXXX" className={cn(inputClass, "ltr-nums")} />
              {errors.phone && <p className={errorTextClass}>{errors.phone.message}</p>}
            </div>
            <div>
              <label className={labelClass}>{t("common.email")}</label>
              <input {...register("email")} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
              <input type="number" step="0.01" {...register("openingBalance")} placeholder="0.00" className={cn(inputClass, "ltr-nums")} />
            </div>

            {serverError && <Alert variant="danger">{serverError}</Alert>}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" fullWidth onClick={closeForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
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
    <Modal
      title={isAr ? "تطبيق الرصيد" : "Apply Store Credit"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد المتاح" : "Available"}:{" "}
          <span className="ltr-nums">{formatMoney(availableCredit, currency, locale)}</span>
        </>
      }
      onClose={onClose}
      size="lg"
    >
      <Button
        size="sm"
        variant="outline"
        className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-200"
        onClick={autoApplyOldestFirst}
        disabled={dueSales.length === 0}
      >
        {isAr ? "تطبيق تلقائي (الأقدم أولاً)" : "Auto-apply oldest first"}
      </Button>

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
              className={cn(inputSmClass, "w-28 ltr-nums")}
            />
          </div>
        ))}
        {dueSales.length === 0 && <p className="py-6 text-center text-sm text-slate-400">{isAr ? "لا توجد فواتير مستحقة" : "No outstanding invoices"}</p>}
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span className="text-slate-500">{isAr ? "الإجمالي المطبق" : "Total to apply"}</span>
        <span className={cn("ltr-nums font-semibold", totalEntered > availableCredit ? "text-red-600" : "text-slate-800")}>
          {formatMoney(totalEntered, currency, locale)}
        </span>
      </div>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      <Button
        fullWidth
        className="mt-4"
        onClick={submit}
        disabled={submitting || totalEntered <= 0 || totalEntered > availableCredit}
      >
        {submitting ? "…" : isAr ? "تطبيق" : "Apply"}
      </Button>
    </Modal>
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
    <Modal
      title={isAr ? "تعديل النقاط" : "Adjust Points"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}:{" "}
          <span className="ltr-nums">{customer.rewardPoints}</span>
        </>
      }
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
          <input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="-50" className={inputClass} autoFocus />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "السبب" : "Reason"}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة ولاء..." : "Correction, goodwill bonus..."} className={inputClass} />
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
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
    <Modal
      title={isAr ? "تعديل الكاش باك" : "Adjust Cashback"}
      subtitle={
        <>
          {isAr ? customer.nameAr || customer.nameEn : customer.nameEn} · {isAr ? "الرصيد الحالي" : "Current balance"}:{" "}
          <span className="ltr-nums">{formatMoney(customer.cashBack, currency, locale)}</span>
        </>
      }
      onClose={onClose}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "التغيير (+/-)" : "Change (+/-)"}</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-25.00" className={inputClass} autoFocus />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "السبب" : "Reason"}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={isAr ? "تصحيح، مكافأة..." : "Correction, goodwill grant..."} className={inputClass} />
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}
