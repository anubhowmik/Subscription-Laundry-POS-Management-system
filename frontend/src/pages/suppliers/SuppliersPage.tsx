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
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { labelClass, inputClass, errorTextClass } from "../../components/ui/formClasses";
import { Truck } from "lucide-react";

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
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema) });

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
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الموردون" : "Suppliers"}
        actions={
          <Button onClick={() => setShowForm(true)}>
            + {isAr ? "إضافة مورد" : "Add Supplier"}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Truck}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "الموردون" : "Suppliers"}
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
              <Th>{isAr ? "الرمز" : "Code"}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("common.phone")}</Th>
              <Th>{isAr ? "الرقم الضريبي" : "VAT Number"}</Th>
              <Th>{isAr ? "شرط الدفع (يوم)" : "Pay Term (days)"}</Th>
              <Th>{isAr ? "حد الائتمان" : "Credit Limit"}</Th>
              <Th>{isAr ? "مستحق الشراء" : "Purchase Due"}</Th>
              <Th>{t("common.status")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{s.code}</span></td>
                <td className="px-4 py-3">{isAr ? s.nameAr || s.nameEn : s.nameEn}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{s.phone}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{s.vatNumber ?? "-"}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{s.paymentTermsDays}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(s.creditLimit, currency, locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(s.balance, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"}>
                    {s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </Badge>
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

      {showForm && (
        <Modal
          title={isAr ? "إضافة مورد" : "Add Supplier"}
          onClose={() => {
            setShowForm(false);
            reset();
            setServerError(null);
          }}
        >
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div>
              <label className={labelClass}>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
              <input {...register("nameEn")} className={inputClass} />
              {errors.nameEn && <p className={errorTextClass}>{errors.nameEn.message}</p>}
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <input {...register("nameAr")} dir="rtl" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t("common.phone")}</label>
              <input {...register("phone")} className={cn(inputClass, "ltr-nums")} />
              {errors.phone && <p className={errorTextClass}>{errors.phone.message}</p>}
            </div>
            <div>
              <label className={labelClass}>{t("common.email")}</label>
              <input {...register("email")} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "الرقم الضريبي" : "VAT Number"}</label>
                <input {...register("vatNumber")} className={cn(inputClass, "ltr-nums")} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "شرط الدفع (يوم)" : "Pay Term (days)"}</label>
                <input type="number" {...register("paymentTermsDays")} className={cn(inputClass, "ltr-nums")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{isAr ? "الرصيد الافتتاحي" : "Opening Balance"}</label>
                <input type="number" step="0.01" {...register("openingBalance")} className={cn(inputClass, "ltr-nums")} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "حد الائتمان" : "Credit Limit"}</label>
                <input type="number" step="0.01" {...register("creditLimit")} placeholder="0.00" className={cn(inputClass, "ltr-nums")} />
              </div>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "العنوان" : "Address"}</label>
              <input {...register("address")} className={inputClass} />
            </div>

            {serverError && <Alert variant="danger">{serverError}</Alert>}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => {
                  setShowForm(false);
                  reset();
                  setServerError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
