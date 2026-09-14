import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { X } from "lucide-react";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, inputSmClass } from "../../components/ui/formClasses";
import { HandCoins, CheckCircle2, XCircle, Banknote, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

type Reason = "LOST" | "DAMAGED" | "DELAYED" | "OTHER";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

const REASON_LABEL: Record<Reason, { en: string; ar: string }> = {
  LOST: { en: "Lost", ar: "مفقود" },
  DAMAGED: { en: "Damaged", ar: "تالف" },
  DELAYED: { en: "Delayed", ar: "متأخر" },
  OTHER: { en: "Other", ar: "أخرى" },
};

const STATUS_LABEL: Record<Status, { en: string; ar: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  APPROVED: { en: "Approved", ar: "موافق عليه" },
  REJECTED: { en: "Rejected", ar: "مرفوض" },
  PAID: { en: "Paid", ar: "مدفوع" },
};

const STATUS_VARIANT: Record<Status, "neutral" | "info" | "danger" | "success"> = {
  PENDING: "neutral",
  APPROVED: "info",
  REJECTED: "danger",
  PAID: "success",
};

type ResolutionType = "CASH" | "POINTS" | "COUPON" | "CASHBACK";

const RESOLUTION_LABEL: Record<ResolutionType, { en: string; ar: string; valueLabelEn: string; valueLabelAr: string }> = {
  CASH: { en: "Cash", ar: "نقدي", valueLabelEn: "Amount", valueLabelAr: "المبلغ" },
  POINTS: { en: "Points", ar: "نقاط", valueLabelEn: "Points to award", valueLabelAr: "النقاط الممنوحة" },
  COUPON: { en: "Coupon", ar: "كوبون", valueLabelEn: "Coupon discount amount (SAR)", valueLabelAr: "قيمة خصم الكوبون (ر.س)" },
  CASHBACK: { en: "Cashback", ar: "كاش باك", valueLabelEn: "Cashback amount (SAR)", valueLabelAr: "قيمة الكاش باك (ر.س)" },
};

interface CompensationItemRow {
  id: string;
  saleItemId: string;
  quantity: string;
  reason: Reason;
  claimedAmount: string;
  approvedAmount: string | null;
  saleItem: { descriptionEn: string; descriptionAr: string | null };
}

interface CompensationRow {
  id: string;
  description: string | null;
  claimedAmount: string;
  approvedAmount: string | null;
  status: Status;
  createdAt: string;
  resolutionType: ResolutionType | null;
  resolutionValue: string | null;
  resolutionCoupon: { code: string } | null;
  sale: { invoiceNumber: string };
  items: CompensationItemRow[];
  customer: { nameEn: string; nameAr: string | null };
  createdByUser: { fullNameEn: string };
  resolvedByUser: { fullNameEn: string } | null;
}

export default function CompensationsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [payingCompensation, setPayingCompensation] = useState<CompensationRow | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Claims accumulate indefinitely (every damaged/lost-item dispute files a new one) - genuinely
  // unbounded, so this gets real server-side pagination/sorting (see compensation.service.ts's
  // SORTABLE_FIELDS) rather than a client-side-only sort.
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
  const filterParams = { status: statusFilter || undefined, sortBy, sortOrder };

  const { data } = useQuery({
    queryKey: ["compensations", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CompensationRow[]>>("/compensations", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      resolutionType,
      resolutionValue,
    }: {
      id: string;
      status: "APPROVED" | "REJECTED" | "PAID";
      resolutionType?: ResolutionType;
      resolutionValue?: number;
    }) => api.put(`/compensations/${id}/resolve`, { status, resolutionType, resolutionValue }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compensations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/compensations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compensations"] }),
  });

  const columns: { key: string; label: string; sortField?: string; render: (c: CompensationRow) => ReactNode; exportValue: (c: CompensationRow) => string | number | null }[] = [
    {
      key: "invoice",
      label: isAr ? "الفاتورة" : "Invoice",
      render: (c) => <span className="ltr-nums">{c.sale.invoiceNumber}</span>,
      exportValue: (c) => c.sale.invoiceNumber,
    },
    {
      key: "customer",
      label: isAr ? "العميل" : "Customer",
      render: (c) => (isAr ? c.customer.nameAr || c.customer.nameEn : c.customer.nameEn),
      exportValue: (c) => (isAr ? c.customer.nameAr || c.customer.nameEn : c.customer.nameEn),
    },
    {
      key: "items",
      label: isAr ? "الأصناف" : "Items",
      render: (c) => (
        <div className="text-xs text-slate-500">
          {c.items.map((it) => (
            <div key={it.id}>
              {isAr ? it.saleItem.descriptionAr || it.saleItem.descriptionEn : it.saleItem.descriptionEn}{" "}
              <span className="text-slate-400">({isAr ? REASON_LABEL[it.reason].ar : REASON_LABEL[it.reason].en})</span>
            </div>
          ))}
        </div>
      ),
      exportValue: (c) =>
        c.items
          .map((it) => `${isAr ? it.saleItem.descriptionAr || it.saleItem.descriptionEn : it.saleItem.descriptionEn} (${isAr ? REASON_LABEL[it.reason].ar : REASON_LABEL[it.reason].en})`)
          .join("; "),
    },
    {
      key: "claimedAmount",
      label: isAr ? "المطالب به" : "Claimed",
      sortField: "claimedAmount",
      render: (c) => <span className="ltr-nums">{formatMoney(c.claimedAmount, currency, locale)}</span>,
      exportValue: (c) => Number(c.claimedAmount),
    },
    {
      key: "approvedAmount",
      label: isAr ? "الموافق عليه" : "Approved",
      sortField: "approvedAmount",
      render: (c) => <span className="ltr-nums">{c.approvedAmount !== null ? formatMoney(c.approvedAmount, currency, locale) : "—"}</span>,
      exportValue: (c) => (c.approvedAmount !== null ? Number(c.approvedAmount) : null),
    },
    {
      key: "status",
      label: t("common.status"),
      sortField: "status",
      render: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{isAr ? STATUS_LABEL[c.status].ar : STATUS_LABEL[c.status].en}</Badge>,
      exportValue: (c) => (isAr ? STATUS_LABEL[c.status].ar : STATUS_LABEL[c.status].en),
    },
  ];
  const columnVisibility = useColumnVisibility(
    "compensations",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "التعويضات" : "Compensations"}
        actions={
          can("compensations.file") ? (
            <Button onClick={() => setFormOpen(true)}>+ {isAr ? "مطالبة جديدة" : "File Claim"}</Button>
          ) : undefined
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={HandCoins}
            cardBg="bg-amber-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "التعويضات" : "Compensations"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <div className="flex flex-wrap gap-2">
            {(["", "PENDING", "APPROVED", "REJECTED", "PAID"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
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
              title={isAr ? "التعويضات" : "Compensations"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<CompensationRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<CompensationRow[]>>("/compensations", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((c) => Object.fromEntries(visibleColumns.map((col) => [col.key, col.exportValue(c)])));
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
              {data?.rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render(c)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-end">
                    <RowActions>
                      {c.status === "PENDING" && can("compensations.approve") && (
                        <>
                          <RowActionButton
                            icon={CheckCircle2}
                            label={isAr ? "موافقة" : "Approve"}
                            variant="success"
                            onClick={() => resolveMutation.mutate({ id: c.id, status: "APPROVED" })}
                          />
                          <RowActionButton
                            icon={XCircle}
                            label={isAr ? "رفض" : "Reject"}
                            variant="danger"
                            onClick={() => resolveMutation.mutate({ id: c.id, status: "REJECTED" })}
                          />
                        </>
                      )}
                      {c.status === "APPROVED" && can("compensations.pay") && (
                        <RowActionButton icon={Banknote} label={isAr ? "تحديد كمدفوع" : "Mark Paid"} variant="success" onClick={() => setPayingCompensation(c)} />
                      )}
                      {c.status === "PAID" && c.resolutionCoupon && (
                        <Badge variant="success" className="ltr-nums">
                          {c.resolutionCoupon.code}
                        </Badge>
                      )}
                      {c.status !== "PAID" && (can("compensations.file") || can("compensations.approve")) && (
                        <RowActionButton
                          icon={Trash2}
                          label={isAr ? "حذف" : "Delete"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? "حذف هذه المطالبة؟" : "Delete this claim?", danger: true })) deleteMutation.mutate(c.id);
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

      {formOpen && <ClaimFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}

      {payingCompensation && (
        <ResolvePaidModal
          isAr={isAr}
          compensation={payingCompensation}
          onClose={() => setPayingCompensation(null)}
          onSubmit={(resolutionType, resolutionValue) => {
            resolveMutation.mutate(
              { id: payingCompensation.id, status: "PAID", resolutionType, resolutionValue },
              { onSuccess: () => setPayingCompensation(null) },
            );
          }}
          pending={resolveMutation.isPending}
        />
      )}
    </div>
  );
}

function ResolvePaidModal({
  isAr,
  compensation,
  onClose,
  onSubmit,
  pending,
}: {
  isAr: boolean;
  compensation: CompensationRow;
  onClose: () => void;
  onSubmit: (resolutionType: ResolutionType, resolutionValue: number) => void;
  pending: boolean;
}) {
  const [resolutionType, setResolutionType] = useState<ResolutionType>("CASH");
  const [resolutionValue, setResolutionValue] = useState(compensation.approvedAmount ?? compensation.claimedAmount);

  const canSubmit = Number(resolutionValue) > 0;

  return (
    <Modal
      title={isAr ? "تحديد كمدفوع" : "Mark Paid"}
      subtitle={<span className="ltr-nums">{compensation.sale.invoiceNumber}</span>}
      onClose={onClose}
      footer={
        <Button fullWidth onClick={() => onSubmit(resolutionType, Number(resolutionValue))} disabled={!canSubmit || pending}>
          {pending ? "…" : isAr ? "تأكيد" : "Confirm"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "طريقة التسوية" : "Resolution Type"}</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(RESOLUTION_LABEL) as ResolutionType[]).map((rt) => (
              <button
                key={rt}
                onClick={() => setResolutionType(rt)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  resolutionType === rt ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                {isAr ? RESOLUTION_LABEL[rt].ar : RESOLUTION_LABEL[rt].en}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>
            {isAr ? RESOLUTION_LABEL[resolutionType].valueLabelAr : RESOLUTION_LABEL[resolutionType].valueLabelEn}
          </label>
          <input
            type="number"
            min={0}
            value={resolutionValue}
            onChange={(e) => setResolutionValue(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}

interface SaleItemPick {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
}

interface SalePick {
  id: string;
  invoiceNumber: string;
  items: SaleItemPick[];
}

interface ClaimLine {
  key: string;
  saleItemId: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  reason: Reason;
  claimedAmount: string;
}

function ClaimFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SalePick[]>([]);
  const [picked, setPicked] = useState<SalePick | null>(null);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    setLines([]);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<SalePick[]>>("/sales", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  function addLine(item: SaleItemPick) {
    if (lines.some((l) => l.saleItemId === item.id)) return;
    setLines((prev) => [
      ...prev,
      { key: item.id, saleItemId: item.id, descriptionEn: item.descriptionEn, descriptionAr: item.descriptionAr, quantity: "1", reason: "DAMAGED", claimedAmount: "" },
    ]);
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<ClaimLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totalClaimed = lines.reduce((sum, l) => sum + (Number(l.claimedAmount) || 0), 0);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/compensations", {
        saleId: picked!.id,
        description: description || undefined,
        items: lines.map((l) => ({
          saleItemId: l.saleItemId,
          quantity: Number(l.quantity),
          reason: l.reason,
          claimedAmount: Number(l.claimedAmount),
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compensations"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picked) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && Number(l.claimedAmount) >= 0);

  return (
    <Modal
      title={isAr ? "مطالبة تعويض جديدة" : "New Compensation Claim"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          fullWidth
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? "…" : isAr ? "تقديم" : "Submit"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label className={labelClass}>{isAr ? "رقم الفاتورة" : "Invoice"}</label>
          <input
            value={picked ? picked.invoiceNumber : search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث برقم الفاتورة" : "Search by invoice number"}
            className={inputClass}
          />
          {results.length > 0 && !picked && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setPicked(s);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {s.invoiceNumber}
                </button>
              ))}
            </div>
          )}
        </div>

        {picked && (
          <div>
            <label className={labelClass}>{isAr ? "أضف صنفًا" : "Add an item"}</label>
            <div className="flex flex-wrap gap-1.5">
              {picked.items.map((item) => {
                const added = lines.some((l) => l.saleItemId === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addLine(item)}
                    disabled={added}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      added ? "border-slate-100 bg-slate-50 text-slate-300" : "border-sky-200 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                    }`}
                  >
                    + {isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-1.5 py-1.5 text-start">{isAr ? "الصنف" : "Item"}</th>
                  <th className="px-1.5 py-1.5 text-start">{isAr ? "الكمية" : "Qty"}</th>
                  <th className="px-1.5 py-1.5 text-start">{isAr ? "السبب" : "Reason"}</th>
                  <th className="px-1.5 py-1.5 text-start">{isAr ? "المبلغ" : "Amount"}</th>
                  <th className="px-1.5 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-slate-100">
                    <td className="px-1.5 py-1.5">{isAr ? l.descriptionAr || l.descriptionEn : l.descriptionEn}</td>
                    <td className="px-1.5 py-1.5">
                      <input
                        type="number"
                        min={0.001}
                        step="0.001"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                        className={`ltr-nums w-16 ${inputSmClass}`}
                      />
                    </td>
                    <td className="px-1.5 py-1.5">
                      <select
                        value={l.reason}
                        onChange={(e) => updateLine(l.key, { reason: e.target.value as Reason })}
                        className={inputSmClass}
                      >
                        {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
                          <option key={r} value={r}>
                            {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={l.claimedAmount}
                        onChange={(e) => updateLine(l.key, { claimedAmount: e.target.value })}
                        className={`ltr-nums w-20 ${inputSmClass}`}
                      />
                    </td>
                    <td className="px-1.5 py-1.5 text-end">
                      <button onClick={() => removeLine(l.key)} className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-red-100 hover:text-red-500" aria-label="remove">
                        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-700">
              <span>{isAr ? "الإجمالي" : "Total"}</span>
              <span className="ltr-nums">{totalClaimed.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>{isAr ? "الوصف" : "Description"}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
