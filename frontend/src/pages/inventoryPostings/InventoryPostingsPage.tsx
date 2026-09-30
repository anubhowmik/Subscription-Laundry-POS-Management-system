import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { Plus, CheckCircle2, ShieldCheck, Pencil, Trash2, Eye, ClipboardCheck } from "lucide-react";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { selectClass } from "../../components/ui/formClasses";
import type { ReactNode } from "react";

interface PostingRow {
  id: string;
  postingDate: string;
  status: "PENDING" | "CONFIRMED";
  cashInDrawer: string;
  reconciledAt: string | null;
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
}

export default function InventoryPostingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { currentLocation, locations } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("postingDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const [businessLocationId, setBusinessLocationId] = useState("");
  const [status, setStatus] = useState("");
  const activeFilterCount = (businessLocationId ? 1 : 0) + (status ? 1 : 0);
  function clearAllFilters() {
    setBusinessLocationId("");
    setStatus("");
    setPage(1);
  }

  const filterParams = {
    sortBy,
    sortOrder,
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(status ? { status } : {}),
  };

  const { data } = useQuery({
    queryKey: ["inventory-postings", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PostingRow[]>>("/inventory-postings", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const [error, setError] = useState<string | null>(null);
  function handleError(err: unknown) {
    setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
  }
  function invalidate() {
    qc.invalidateQueries({ queryKey: ["inventory-postings"] });
  }

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/inventory-postings/${id}/confirm`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: handleError,
  });
  const reconcileMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/inventory-postings/${id}/reconcile`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: handleError,
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/inventory-postings/${id}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: handleError,
  });

  const columns: { key: string; label: string; sortField?: string; render: (p: PostingRow) => ReactNode; exportValue: (p: PostingRow) => string | number | null }[] = [
    {
      key: "postingDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "postingDate",
      render: (p) => <span className="ltr-nums">{new Date(p.postingDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (p) => new Date(p.postingDate).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "businessLocation",
      label: isAr ? "الفرع" : "Location",
      render: (p) => p.businessLocation.branchName,
      exportValue: (p) => p.businessLocation.branchName,
    },
    {
      key: "inStock",
      label: isAr ? "في المتجر" : "In Stock",
      render: (p) => (
        <span className="ltr-nums">
          {p.inStockCount} <span className="text-slate-400">({formatMoney(p.inStockTotal, currency, locale)})</span>
        </span>
      ),
      exportValue: (p) => `${p.inStockCount} (${formatMoney(p.inStockTotal, currency, locale)})`,
    },
    {
      key: "outStock",
      label: isAr ? "تم التسليم" : "Out Stock",
      render: (p) => (
        <span className="ltr-nums">
          {p.outStockCount} <span className="text-slate-400">({formatMoney(p.outStockTotal, currency, locale)})</span>
        </span>
      ),
      exportValue: (p) => `${p.outStockCount} (${formatMoney(p.outStockTotal, currency, locale)})`,
    },
    {
      key: "inWarehouse",
      label: isAr ? "في المستودع" : "In Warehouse",
      render: (p) => (
        <span className="ltr-nums">
          {p.inWarehouseCount} <span className="text-slate-400">({formatMoney(p.inWarehouseTotal, currency, locale)})</span>
        </span>
      ),
      exportValue: (p) => `${p.inWarehouseCount} (${formatMoney(p.inWarehouseTotal, currency, locale)})`,
    },
    {
      key: "cashInDrawer",
      label: isAr ? "النقد بالدرج" : "Cash in Drawer",
      sortField: "cashInDrawer",
      render: (p) => <span className="ltr-nums">{formatMoney(p.cashInDrawer, currency, locale)}</span>,
      exportValue: (p) => Number(p.cashInDrawer),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (p) => (
        <div className="flex flex-col gap-1">
          <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"}>
            {p.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معلق" : "Pending"}
          </Badge>
          {p.reconciledAt && <Badge variant="neutral">{isAr ? "تمت التسوية" : "Reconciled"}</Badge>}
        </div>
      ),
      exportValue: (p) => (p.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معلق" : "Pending"),
    },
    {
      key: "createdByUser",
      label: isAr ? "بواسطة" : "By",
      render: (p) => p.createdByUser.fullNameEn,
      exportValue: (p) => p.createdByUser.fullNameEn,
    },
  ];
  const columnVisibility = useColumnVisibility("inventory-postings", columns.map((c) => c.key));
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "جرد المخزون" : "Inventory Counting"}
        actions={
          <Button onClick={() => navigate("/inventory-postings/create")}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة جرد" : "Add Inventory Posting"}
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={ClipboardCheck}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "جرد المخزون" : "Inventory Counts"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Location"}</label>
              <select
                value={businessLocationId}
                onChange={(e) => {
                  setBusinessLocationId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.status")}</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="PENDING">{isAr ? "معلق" : "Pending"}</option>
                <option value="CONFIRMED">{isAr ? "مؤكد" : "Confirmed"}</option>
              </select>
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
              title={isAr ? "جرد المخزون" : "Inventory Postings"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<PostingRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<PostingRow[]>>("/inventory-postings", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((p) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(p)])));
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
                <Th>{t("common.actions")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(p)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActions>
                      <RowActionButton
                        icon={p.status === "PENDING" ? Pencil : Eye}
                        label={p.status === "PENDING" ? (isAr ? "تعديل" : "Edit") : isAr ? "عرض" : "View"}
                        onClick={() => navigate(`/inventory-postings/${p.id}`)}
                      />
                      {p.status === "PENDING" && (
                        <RowActionButton
                          icon={CheckCircle2}
                          label={isAr ? "تأكيد" : "Confirm"}
                          variant="success"
                          disabled={confirmMutation.isPending}
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "تأكيد هذا الجرد؟" : "Confirm this posting?" })) confirmMutation.mutate(p.id);
                          }}
                        />
                      )}
                      {p.status === "CONFIRMED" && !p.reconciledAt && (
                        <RowActionButton
                          icon={ShieldCheck}
                          label={isAr ? "تسوية" : "Reconcile"}
                          variant="success"
                          disabled={reconcileMutation.isPending}
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "تسوية هذا الجرد؟" : "Reconcile this posting?" })) reconcileMutation.mutate(p.id);
                          }}
                        />
                      )}
                      {p.status === "PENDING" && (
                        <RowActionButton
                          icon={Trash2}
                          label={t("common.delete")}
                          variant="danger"
                          disabled={deleteMutation.isPending}
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "حذف هذا الجرد؟" : "Delete this posting?", danger: true })) deleteMutation.mutate(p.id);
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
