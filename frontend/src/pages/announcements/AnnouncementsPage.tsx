import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Megaphone, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

interface AnnouncementRow {
  id: string;
  fromDate: string;
  toDate: string;
  content: string;
  isPublished: boolean;
  locations: { businessLocation: { branchName: string } }[];
  createdByUser: { fullNameEn: string };
}

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Sortable column headers - backend whitelists these fields (announcement.service.ts's
  // SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("createdAt");
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
    queryKey: ["announcements", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AnnouncementRow[]>>("/announcements", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (a: AnnouncementRow) => ReactNode; exportValue: (a: AnnouncementRow) => string | number | null }[] = [
    {
      key: "fromDate",
      label: isAr ? "من تاريخ" : "From Date",
      sortField: "fromDate",
      render: (a) => <span className="ltr-nums">{new Date(a.fromDate).toLocaleDateString(locale)}</span>,
      exportValue: (a) => new Date(a.fromDate).toLocaleDateString(locale),
    },
    {
      key: "toDate",
      label: isAr ? "إلى تاريخ" : "To Date",
      sortField: "toDate",
      render: (a) => <span className="ltr-nums">{new Date(a.toDate).toLocaleDateString(locale)}</span>,
      exportValue: (a) => new Date(a.toDate).toLocaleDateString(locale),
    },
    {
      key: "locations",
      label: isAr ? "الفرع" : "Branch",
      render: (a) => (a.locations.length === 0 ? (isAr ? "كل الفروع" : "All locations") : a.locations.map((l) => l.businessLocation.branchName).join(", ")),
      exportValue: (a) => (a.locations.length === 0 ? "All locations" : a.locations.map((l) => l.businessLocation.branchName).join(", ")),
    },
    { key: "content", label: isAr ? "الإعلان" : "Announcement", render: (a) => <span className="block max-w-xs truncate">{a.content}</span>, exportValue: (a) => a.content },
    {
      key: "isPublished",
      label: t("common.status"),
      render: (a) => <Badge variant={a.isPublished ? "success" : "neutral"}>{a.isPublished ? (isAr ? "منشور" : "Published") : isAr ? "مسودة" : "Draft"}</Badge>,
      exportValue: (a) => (a.isPublished ? (isAr ? "منشور" : "Published") : isAr ? "مسودة" : "Draft"),
    },
  ];

  const columnVisibility = useColumnVisibility(
    "announcements",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الإعلانات" : "Announcements"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "إضافة إعلان" : "Add"}</Button>}
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Megaphone}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "الإعلانات" : "Announcements"}
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
              title={isAr ? "الإعلانات" : "Announcements"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<AnnouncementRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<AnnouncementRow[]>>("/announcements", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((a) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(a)])));
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
            {data?.rows.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(a)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <RowActions>
                    <RowActionButton
                      icon={Trash2}
                      label={isAr ? "حذف" : "Delete"}
                      variant="danger"
                      onClick={async () => {
                        if (await confirmAction({ message: isAr ? "حذف هذا الإعلان؟" : "Delete this announcement?", danger: true })) deleteMutation.mutate(a.id);
                      }}
                    />
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

      {formOpen && (
        <AnnouncementFormModal
          isAr={isAr}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["announcements"] });
            qc.invalidateQueries({ queryKey: ["active-announcements"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AnnouncementFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const { locations } = useBusinessLocation();
  const today = new Date().toISOString().slice(0, 10);
  const [businessLocationIds, setBusinessLocationIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function toggleLocation(id: string) {
    setBusinessLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/announcements", {
        businessLocationIds,
        fromDate,
        toDate,
        content,
        isPublished,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(fromDate) && Boolean(toDate) && toDate >= fromDate && content.trim().length > 0;

  return (
    <Modal title={isAr ? "إضافة إعلان" : "Add Announcement"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "من تاريخ" : "From Date"}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "إلى تاريخ" : "To Date"}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>
            {isAr ? "الفروع" : "Business Locations"} <span className="text-slate-400">({isAr ? "اتركه فارغًا لكل الفروع" : "leave empty for all locations"})</span>
          </label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={businessLocationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} />
                {l.branchName}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الإعلان" : "Announcement"}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          {isAr ? "منشور" : "Published"}
        </label>
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
