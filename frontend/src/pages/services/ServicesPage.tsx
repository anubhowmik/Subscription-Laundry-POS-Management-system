import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ServiceFormModal, type EditingService } from "../../components/services/ServiceFormModal";

interface Service {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string;
  price: string;
  categoryId: string | null;
  taxId: string | null;
  estimatedProcessingHours: number;
  category: { nameEn: string; nameAr: string } | null;
  status: "ACTIVE" | "INACTIVE";
}

export default function ServicesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingService | null>(null);

  const { data } = useQuery({
    queryKey: ["services", search],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Service[]>>("/services", { params: { search, limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/services/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["pos", "services"] });
    },
  });

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(s: Service) {
    setEditing({
      id: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      code: s.code,
      price: s.price,
      categoryId: s.categoryId,
      taxId: s.taxId,
      estimatedProcessingHours: s.estimatedProcessingHours,
    });
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("services.title")}</h1>
        <button onClick={openAdd} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "خدمة جديدة" : "Add Service"}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {formOpen && (
        <ServiceFormModal
          isAr={isAr}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{t("services.code")}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{t("services.category")}</th>
              <th className="px-4 py-2 text-start">{t("services.price")}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{s.code}</span></td>
                <td className="px-4 py-2">{isAr ? s.nameAr || s.nameEn : s.nameEn}</td>
                <td className="px-4 py-2">{s.category ? (isAr ? s.category.nameAr : s.category.nameEn) : "-"}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(s.price, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(s)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                    {s.status === "ACTIVE" && (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? `حذف "${s.nameEn}"؟` : `Delete "${s.nameEn}"?`)) deleteMutation.mutate(s.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {isAr ? "حذف" : "Delete"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
