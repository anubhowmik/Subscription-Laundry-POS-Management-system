import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta, Supplier } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";

const schema = z.object({
  nameEn: z.string().min(1, "Required"),
  nameAr: z.string().optional(),
  phone: z.string().min(1, "Required"),
  email: z.string().email().optional().or(z.literal("")),
  vatNumber: z.string().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional(),
  openingBalance: z.coerce.number().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function SuppliersPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["suppliers", search, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Supplier[]>>("/suppliers", { params: { search, page, limit: 20 } });
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
      const res = await api.post<ApiSuccess<Supplier>>("/suppliers", values);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setShowForm(false);
      reset();
      setServerError(null);
    },
    onError: (err) => {
      setServerError(isAxiosError(err) ? err.response?.data?.message ?? t("common.somethingWentWrong") : t("common.somethingWentWrong"));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الموردون" : "Suppliers"}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {isAr ? "إضافة مورد" : "Add Supplier"}
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
              <th className="px-4 py-2 text-start">{isAr ? "الرمز" : "Code"}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{t("common.phone")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الرقم الضريبي" : "VAT Number"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "شرط الدفع (يوم)" : "Pay Term (days)"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "حد الائتمان" : "Credit Limit"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "مستحق الشراء" : "Purchase Due"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{s.code}</span></td>
                <td className="px-4 py-2">{isAr ? s.nameAr || s.nameEn : s.nameEn}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{s.phone}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{s.vatNumber ?? "-"}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{s.paymentTermsDays}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(s.creditLimit, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(s.balance, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
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
            <h2 className="mb-4 text-lg font-semibold text-slate-800">{isAr ? "إضافة مورد" : "Add Supplier"}</h2>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
                <input {...register("nameEn")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
                {errors.nameEn && <p className="mt-1 text-xs text-red-600">{errors.nameEn.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
                <input {...register("nameAr")} dir="rtl" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.phone")}</label>
                <input {...register("phone")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.email")}</label>
                <input {...register("email")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "الرقم الضريبي" : "VAT Number"}</label>
                  <input {...register("vatNumber")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "شرط الدفع (يوم)" : "Pay Term (days)"}</label>
                  <input type="number" {...register("paymentTermsDays")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
                  <input type="number" step="0.01" {...register("openingBalance")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "حد الائتمان" : "Credit Limit"}</label>
                  <input type="number" step="0.01" {...register("creditLimit")} placeholder="0.00" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{isAr ? "العنوان" : "Address"}</label>
                <input {...register("address")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
    </div>
  );
}
