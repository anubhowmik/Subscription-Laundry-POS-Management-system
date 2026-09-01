import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ServiceFormModal, type EditingService } from "../../components/services/ServiceFormModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { Shirt } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader
        title={t("services.title")}
        actions={<Button onClick={openAdd}>+ {isAr ? "خدمة جديدة" : "Add Service"}</Button>}
      />

      {formOpen && (
        <ServiceFormModal
          isAr={isAr}
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Shirt}
            cardBg="bg-app-pos-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={t("services.title")}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="max-w-xs" />
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("services.code")}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{t("services.category")}</Th>
              <Th>{t("services.price")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{s.code}</span></td>
                <td className="px-4 py-3">{isAr ? s.nameAr || s.nameEn : s.nameEn}</td>
                <td className="px-4 py-3">{s.category ? (isAr ? s.category.nameAr : s.category.nameEn) : "-"}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(s.price, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"}>
                    {s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                      {isAr ? "تعديل" : "Edit"}
                    </Button>
                    {s.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `حذف "${s.nameEn}"؟` : `Delete "${s.nameEn}"?`, danger: true })) deleteMutation.mutate(s.id);
                        }}
                      >
                        {isAr ? "حذف" : "Delete"}
                      </Button>
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
        </Table>
        </TableScroll>
      </TableContainer>
    </div>
  );
}
