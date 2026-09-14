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
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { SearchInput } from "../../components/ui/SearchInput";
import { Shirt, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingService | null>(null);

  // Sortable column headers matching the reference's DataTable - backend already whitelists
  // these fields (service.service.ts's SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("nameEn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const columns: { key: string; label: string; sortField?: string; render: (s: Service) => ReactNode; exportValue: (s: Service) => string | number | null }[] = [
    { key: "code", label: t("services.code"), render: (s) => <span className="ltr-nums">{s.code}</span>, exportValue: (s) => s.code },
    {
      key: "name",
      label: t("common.name"),
      sortField: "nameEn",
      render: (s) => (isAr ? s.nameAr || s.nameEn : s.nameEn),
      exportValue: (s) => (isAr ? s.nameAr || s.nameEn : s.nameEn),
    },
    {
      key: "category",
      label: t("services.category"),
      render: (s) => (s.category ? (isAr ? s.category.nameAr : s.category.nameEn) : "-"),
      exportValue: (s) => (s.category ? (isAr ? s.category.nameAr : s.category.nameEn) : null),
    },
    {
      key: "price",
      label: t("services.price"),
      sortField: "price",
      render: (s) => <span className="ltr-nums">{formatMoney(s.price, currency, locale)}</span>,
      exportValue: (s) => Number(s.price),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (s) => <Badge variant={s.status === "ACTIVE" ? "success" : "neutral"}>{s.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</Badge>,
      exportValue: (s) => (s.status === "ACTIVE" ? t("common.active") : t("common.inactive")),
    },
  ];

  const columnVisibility = useColumnVisibility(
    "services",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search,
    sortBy,
    sortOrder,
  };

  const { data } = useQuery({
    queryKey: ["services", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Service[]>>("/services", { params: { ...filterParams, page, limit } });
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
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
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
              title={t("services.title")}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<Service>(async (p, l) => {
                  const res = await api.get<ApiSuccess<Service[]>>("/services", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((s) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(s)])));
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
              <Th className="text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(s)}
                  </td>
                ))}
                <td className="px-4 py-3 text-end">
                  <RowActions>
                    <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => openEdit(s)} />
                    {s.status === "ACTIVE" && (
                      <RowActionButton
                        icon={Trash2}
                        label={isAr ? "حذف" : "Delete"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `حذف "${s.nameEn}"؟` : `Delete "${s.nameEn}"?`, danger: true })) deleteMutation.mutate(s.id);
                        }}
                      />
                    )}
                  </RowActions>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
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
