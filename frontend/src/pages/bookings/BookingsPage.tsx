import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
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
import { inputClass, selectClass, labelClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { CalendarClock, CheckCircle2, CheckCheck, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type BookingType = "PICKUP" | "DELIVERY";
type BookingStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

const STATUS_LABEL: Record<BookingStatus, { en: string; ar: string; variant: "neutral" | "info" | "success" | "danger" }> = {
  REQUESTED: { en: "Requested", ar: "مطلوب", variant: "neutral" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد", variant: "info" },
  COMPLETED: { en: "Completed", ar: "مكتمل", variant: "success" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", variant: "danger" },
};

interface BookingRow {
  id: string;
  type: BookingType;
  scheduledAt: string;
  address: string | null;
  status: BookingStatus;
  notes: string | null;
  customer: { nameEn: string; nameAr: string | null; phone: string };
  businessLocation: { branchName: string };
}

export default function BookingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<BookingStatus | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Sortable column headers - backend whitelists these fields (booking.service.ts's
  // SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("scheduledAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = { status: statusFilter || undefined, sortBy, sortOrder };

  const { data } = useQuery({
    queryKey: ["bookings", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<BookingRow[]>>("/bookings", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => api.put(`/bookings/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (b: BookingRow) => ReactNode; exportValue: (b: BookingRow) => string | number | null }[] = [
    {
      key: "scheduledAt",
      label: isAr ? "الموعد" : "Scheduled",
      sortField: "scheduledAt",
      render: (b) => <span className="ltr-nums">{new Date(b.scheduledAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>,
      exportValue: (b) => new Date(b.scheduledAt).toLocaleString(isAr ? "ar-SA" : "en-US"),
    },
    {
      key: "type",
      label: isAr ? "النوع" : "Type",
      sortField: "type",
      render: (b) => (
        <Badge variant={b.type === "PICKUP" ? "warning" : "info"} className={b.type === "DELIVERY" ? "!bg-teal-100 !text-teal-700 !ring-teal-200" : ""}>
          {b.type === "PICKUP" ? (isAr ? "استلام" : "Pickup") : isAr ? "توصيل" : "Delivery"}
        </Badge>
      ),
      exportValue: (b) => (b.type === "PICKUP" ? "Pickup" : "Delivery"),
    },
    {
      key: "customer",
      label: isAr ? "العميل" : "Customer",
      render: (b) => (
        <>
          {isAr ? b.customer.nameAr || b.customer.nameEn : b.customer.nameEn} <span className="ltr-nums text-xs text-slate-400">({b.customer.phone})</span>
        </>
      ),
      exportValue: (b) => (isAr ? b.customer.nameAr || b.customer.nameEn : b.customer.nameEn),
    },
    { key: "address", label: isAr ? "العنوان" : "Address", render: (b) => <span className="block max-w-[200px] truncate text-slate-500">{b.address ?? "—"}</span>, exportValue: (b) => b.address },
    { key: "businessLocation", label: isAr ? "الفرع" : "Branch", render: (b) => b.businessLocation.branchName, exportValue: (b) => b.businessLocation.branchName },
    {
      key: "status",
      label: t("common.status"),
      sortField: "status",
      render: (b) => <Badge variant={STATUS_LABEL[b.status].variant}>{isAr ? STATUS_LABEL[b.status].ar : STATUS_LABEL[b.status].en}</Badge>,
      exportValue: (b) => (isAr ? STATUS_LABEL[b.status].ar : STATUS_LABEL[b.status].en),
    },
  ];

  const columnVisibility = useColumnVisibility(
    "bookings",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الحجوزات" : "Bookings"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "حجز جديد" : "New Booking"}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={CalendarClock}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "الحجوزات" : "Bookings"}
          value={String(data?.meta.total ?? 0)}
        />
      </div>

      <TableContainer>
        <TableToolbar>
          <div className="flex flex-wrap gap-2">
            {(["", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {s === "" ? (isAr ? "الكل" : "All") : isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
              </button>
            ))}
          </div>
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
              title={isAr ? "الحجوزات" : "Bookings"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<BookingRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<BookingRow[]>>("/bookings", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((b) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(b)])));
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
              <Th className="!text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(b)}
                  </td>
                ))}
                <td className="px-4 py-3 text-end">
                  <RowActions>
                    {b.status === "REQUESTED" && (
                      <RowActionButton
                        icon={CheckCircle2}
                        label={isAr ? "تأكيد" : "Confirm"}
                        variant="success"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "CONFIRMED" })}
                      />
                    )}
                    {b.status === "CONFIRMED" && (
                      <RowActionButton
                        icon={CheckCheck}
                        label={isAr ? "إتمام" : "Complete"}
                        variant="success"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}
                      />
                    )}
                    {(b.status === "REQUESTED" || b.status === "CONFIRMED") && (
                      <RowActionButton
                        icon={XCircle}
                        label={isAr ? "إلغاء" : "Cancel"}
                        variant="danger"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "CANCELLED" })}
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

      {formOpen && <BookingFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}
    </div>
  );
}

interface CustomerPick {
  id: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
}

function BookingFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { locations, currentLocationId } = useBusinessLocation();

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [type, setType] = useState<BookingType>("PICKUP");
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [picked, setPicked] = useState<CustomerPick | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<CustomerPick[]>>("/customers", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/bookings", {
        businessLocationId,
        customerId: picked!.id,
        type,
        scheduledAt: new Date(scheduledAt).toISOString(),
        address: address || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picked) && businessLocationId && scheduledAt;

  return (
    <Modal
      title={isAr ? "حجز جديد" : "New Booking"}
      onClose={onClose}
      footer={
        <Button
          fullWidth
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label className={labelClass}>{isAr ? "العميل" : "Customer"}</label>
          <input
            value={picked ? (isAr ? picked.nameAr || picked.nameEn : picked.nameEn) : search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث بالاسم أو الهاتف" : "Search by name or phone"}
            className={inputClass}
          />
          {results.length > 0 && !picked && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setPicked(c);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "النوع" : "Type"}</label>
            <select value={type} onChange={(e) => setType(e.target.value as BookingType)} className={selectClass}>
              <option value="PICKUP">{isAr ? "استلام" : "Pickup"}</option>
              <option value="DELIVERY">{isAr ? "توصيل" : "Delivery"}</option>
            </select>
          </div>
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
        </div>

        <div>
          <label className={labelClass}>{isAr ? "التاريخ والوقت" : "Date & Time"}</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "العنوان" : "Address"}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
