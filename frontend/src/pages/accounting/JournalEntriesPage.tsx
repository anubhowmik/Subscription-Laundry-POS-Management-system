import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { Account, ApiSuccess, JournalEntry, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { FormSection } from "../../components/ui/FormSection";
import { Plus, Trash2, ScrollText, Undo2, Eye, Pencil, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
}
const BLANK_LINE: LineDraft = { accountId: "", debit: "", credit: "", memo: "" };

export default function JournalEntriesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [viewing, setViewing] = useState<JournalEntry | null>(null);

  const [status, setStatus] = useState<"" | "draft" | "posted">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const activeFilterCount = (status ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);
  function clearAllFilters() {
    setStatus("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState("entryDate");
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
  const filterParams = {
    sortBy,
    sortOrder,
    ...(status ? { status } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
  };

  const { data } = useQuery({
    queryKey: ["journal-entries", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<JournalEntry[]>>("/accounting/journal-entries", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounting-accounts-flat"],
    queryFn: async () => (await api.get<ApiSuccess<Account[]>>("/accounting/accounts")).data.data,
  });
  const flatAccounts = (accounts ?? []).flatMap((a) => [a, ...(a.childAccounts ?? [])]);

  const postMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/accounting/journal-entries/${id}/post`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal-entries"] }),
  });
  const reverseMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/accounting/journal-entries/${id}/reverse`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal-entries"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/accounting/journal-entries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal-entries"] }),
  });

  const columns: {
    key: string;
    label: string;
    sortField?: string;
    render: (e: JournalEntry) => ReactNode;
    exportValue: (e: JournalEntry) => string | number | null;
  }[] = [
    {
      key: "entryDate",
      label: isAr ? "التاريخ" : "Date",
      sortField: "entryDate",
      render: (e) => <span className="ltr-nums">{formatDate(e.entryDate, locale)}</span>,
      exportValue: (e) => formatDate(e.entryDate, locale),
    },
    {
      key: "reference",
      label: isAr ? "المرجع" : "Reference",
      sortField: "reference",
      render: (e) => e.reference ?? "-",
      exportValue: (e) => e.reference,
    },
    {
      key: "total",
      label: isAr ? "الإجمالي" : "Total",
      render: (e) => <span className="ltr-nums">{formatMoney(e.lines.reduce((s, l) => s + Number(l.debit), 0), currency, locale)}</span>,
      exportValue: (e) => e.lines.reduce((s, l) => s + Number(l.debit), 0),
    },
    {
      key: "status",
      label: isAr ? "الحالة" : "Status",
      render: (e) => (
        <>
          <Badge variant={e.postedAt ? "success" : "warning"}>{e.postedAt ? (isAr ? "مرحّل" : "Posted") : isAr ? "مسودة" : "Draft"}</Badge>
          {e.reversalOfId && <Badge variant="info" className="ms-1.5">{isAr ? "عكسي" : "Reversal"}</Badge>}
        </>
      ),
      exportValue: (e) => (e.postedAt ? "Posted" : "Draft"),
    },
  ];
  const columnVisibility = useColumnVisibility(
    "journal-entries",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "القيود اليومية" : "Journal Entries"}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {isAr ? "إضافة قيد" : "Add Journal Entry"}
          </Button>
        }
      />

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الحالة" : "Status"}</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "" | "draft" | "posted");
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="draft">{isAr ? "مسودة" : "Draft"}</option>
                <option value="posted">{isAr ? "مرحّل" : "Posted"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
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
              title={isAr ? "القيود اليومية" : "Journal Entries"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<JournalEntry>(async (p, l) => {
                  const res = await api.get<ApiSuccess<JournalEntry[]>>("/accounting/journal-entries", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((e) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(e)])));
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
                <Th>{isAr ? "إجراءات" : "Actions"}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      {c.render(entry)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActions>
                      {!entry.postedAt && (
                        <>
                          <RowActionButton
                            icon={Pencil}
                            label={t("common.edit")}
                            onClick={() => {
                              setEditing(entry);
                              setFormOpen(true);
                            }}
                          />
                          <RowActionButton
                            icon={CheckCircle2}
                            label={isAr ? "ترحيل" : "Post"}
                            variant="success"
                            onClick={() => postMutation.mutate(entry.id)}
                          />
                          <RowActionButton
                            icon={Trash2}
                            label={isAr ? "حذف" : "Delete"}
                            variant="danger"
                            onClick={async () => {
                              if (await confirmAction({ message: isAr ? "حذف هذا القيد؟" : "Delete this entry?", danger: true })) {
                                deleteMutation.mutate(entry.id);
                              }
                            }}
                          />
                        </>
                      )}
                      {entry.postedAt && (
                        <>
                          <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} onClick={() => setViewing(entry)} />
                          {!entry.reversalOfId && (
                            <RowActionButton icon={Undo2} label={isAr ? "عكس" : "Reverse"} onClick={() => reverseMutation.mutate(entry.id)} />
                          )}
                        </>
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

      {formOpen && (
        <JournalEntryFormModal
          isAr={isAr}
          editing={editing}
          accounts={flatAccounts}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}

      {viewing && (
        <JournalEntryFormModal isAr={isAr} editing={viewing} accounts={flatAccounts} readOnly onClose={() => setViewing(null)} onSaved={() => setViewing(null)} />
      )}
    </div>
  );
}

function JournalEntryFormModal({
  isAr,
  editing,
  accounts,
  readOnly = false,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: JournalEntry | null;
  accounts: Account[];
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [entryDate, setEntryDate] = useState(editing?.entryDate ? editing.entryDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    editing?.lines.length
      ? editing.lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) ? l.debit : "", credit: Number(l.credit) ? l.credit : "", memo: l.memo ?? "" }))
      : [{ ...BLANK_LINE }, { ...BLANK_LINE }],
  );
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, field: keyof LineDraft, value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        entryDate,
        reference: reference || undefined,
        memo: memo || undefined,
        lines: lines
          .filter((l) => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0))
          .map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo || undefined })),
      };
      if (editing) return api.put(`/accounting/journal-entries/${editing.id}`, payload);
      return api.post("/accounting/journal-entries", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong")),
  });

  const title = readOnly
    ? isAr
      ? "عرض القيد"
      : "View Journal Entry"
    : editing
      ? isAr
        ? "تعديل القيد"
        : "Edit Journal Entry"
      : isAr
        ? "إضافة قيد"
        : "Add Journal Entry";

  return (
    <Modal title={title} onClose={onClose} size="2xl">
      <div className="space-y-4">
        <FormSection title={isAr ? "تفاصيل القيد" : "Entry Details"} icon={ScrollText}>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "التاريخ" : "Date"}</label>
              <input type="date" value={entryDate} disabled={readOnly} onChange={(e) => setEntryDate(e.target.value)} className={inputClass + " ltr-nums"} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "المرجع" : "Reference"}</label>
              <input value={reference} disabled={readOnly} onChange={(e) => setReference(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "ملاحظة" : "Memo"}</label>
              <input value={memo} disabled={readOnly} onChange={(e) => setMemo(e.target.value)} className={inputClass} />
            </div>
          </div>
        </FormSection>

        <FormSection
          title={isAr ? "البنود" : "Lines"}
          icon={ScrollText}
          actions={
            !readOnly && (
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((prev) => [...prev, { ...BLANK_LINE }])}>
                <Plus className="me-1 h-3.5 w-3.5" /> {isAr ? "إضافة بند" : "Add Line"}
              </Button>
            )
          }
        >
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className={cn("grid items-end gap-2", readOnly ? "grid-cols-[2fr_1fr_1fr_1fr]" : "grid-cols-[2fr_1fr_1fr_1fr_auto]")}>
                <div>
                  {i === 0 && <label className={labelClass}>{isAr ? "الحساب" : "Account"}</label>}
                  <select value={line.accountId} disabled={readOnly} onChange={(e) => updateLine(i, "accountId", e.target.value)} className={selectClass}>
                    <option value="">{isAr ? "اختر" : "Select"}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {isAr ? a.nameAr || a.nameEn : a.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {i === 0 && <label className={labelClass}>{isAr ? "مدين" : "Debit"}</label>}
                  <input
                    type="number"
                    step="0.01"
                    value={line.debit}
                    disabled={readOnly}
                    onChange={(e) => updateLine(i, "debit", e.target.value)}
                    placeholder="0.00"
                    className={inputClass + " ltr-nums"}
                  />
                </div>
                <div>
                  {i === 0 && <label className={labelClass}>{isAr ? "دائن" : "Credit"}</label>}
                  <input
                    type="number"
                    step="0.01"
                    value={line.credit}
                    disabled={readOnly}
                    onChange={(e) => updateLine(i, "credit", e.target.value)}
                    placeholder="0.00"
                    className={inputClass + " ltr-nums"}
                  />
                </div>
                <div>
                  {i === 0 && <label className={labelClass}>{isAr ? "ملاحظة" : "Memo"}</label>}
                  <input value={line.memo} disabled={readOnly} onChange={(e) => updateLine(i, "memo", e.target.value)} className={inputClass} />
                </div>
                {!readOnly && (
                  <button type="button" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))} className="mb-2.5 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-100 pt-3 text-sm">
            <span>
              {isAr ? "إجمالي المدين" : "Total Debit"}: <span className="ltr-nums font-semibold">{totalDebit.toFixed(2)}</span>
            </span>
            <span>
              {isAr ? "إجمالي الدائن" : "Total Credit"}: <span className="ltr-nums font-semibold">{totalCredit.toFixed(2)}</span>
            </span>
            <Badge variant={isBalanced ? "success" : "danger"}>{isBalanced ? (isAr ? "متوازن" : "Balanced") : isAr ? "غير متوازن" : "Not balanced"}</Badge>
          </div>
        </FormSection>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {readOnly ? t("common.close") : t("common.cancel")}
          </Button>
          {!readOnly && (
            <Button type="button" fullWidth disabled={!isBalanced || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
