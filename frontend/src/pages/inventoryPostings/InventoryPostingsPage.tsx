import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";

interface PostingRow {
  id: string;
  postingDate: string;
  status: "PENDING" | "CONFIRMED";
  cashInDrawer: string;
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
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);

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

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = { sortBy, sortOrder };

  const { data } = useQuery({
    queryKey: ["inventory-postings", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PostingRow[]>>("/inventory-postings", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
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
      label: isAr ? "الفرع" : "Branch",
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
        <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"}>
          {p.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معلق" : "Pending"}
        </Badge>
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
          <Button onClick={() => setFormOpen(true)}>
            + {isAr ? "تسجيل جرد جديد" : "New Posting"}
          </Button>
        }
      />

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
                </tr>
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-400">
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

      {formOpen && (
        <PostingFormModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["inventory-postings"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface Snapshot {
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
}

function PostingFormModal({
  isAr,
  currency,
  locale,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [cashInDrawer, setCashInDrawer] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: snapshot, isFetching } = useQuery({
    queryKey: ["posting-preview", businessLocationId],
    queryFn: async () => (await api.get<ApiSuccess<Snapshot>>("/inventory-postings/preview", { params: { businessLocationId } })).data.data,
    enabled: Boolean(businessLocationId),
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory-postings", {
        businessLocationId,
        cashInDrawer: cashInDrawer ? Number(cashInDrawer) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && Boolean(snapshot);

  return (
    <Modal
      title={isAr ? "تسجيل جرد جديد" : "New Inventory Posting"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "حفظ الجرد" : "Save Posting"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
          <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={selectClass}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>

        {isFetching && <p className="text-xs text-slate-400">{isAr ? "جارٍ الحساب..." : "Computing..."}</p>}

        {snapshot && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-xs font-semibold text-emerald-700">{isAr ? "في المتجر" : "In Stock"}</p>
              <p className="ltr-nums text-lg font-bold text-emerald-800">{snapshot.inStockCount}</p>
              <p className="ltr-nums text-xs text-emerald-600">{formatMoney(snapshot.inStockTotal, currency, locale)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xs font-semibold text-amber-700">{isAr ? "في المستودع" : "In Warehouse"}</p>
              <p className="ltr-nums text-lg font-bold text-amber-800">{snapshot.inWarehouseCount}</p>
              <p className="ltr-nums text-xs text-amber-600">{formatMoney(snapshot.inWarehouseTotal, currency, locale)}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-xs font-semibold text-red-700">{isAr ? "تم التسليم" : "Out Stock"}</p>
              <p className="ltr-nums text-lg font-bold text-red-800">{snapshot.outStockCount}</p>
              <p className="ltr-nums text-xs text-red-600">{formatMoney(snapshot.outStockTotal, currency, locale)}</p>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>{isAr ? "النقد بالدرج" : "Cash in Drawer"}</label>
          <input type="number" min={0} value={cashInDrawer} onChange={(e) => setCashInDrawer(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
