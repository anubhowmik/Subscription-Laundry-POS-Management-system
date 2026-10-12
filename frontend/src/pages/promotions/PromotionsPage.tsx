import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BadgePercent, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { confirmAction } from "../../stores/confirmStore";
import { fetchAllRows } from "../../lib/tableExport";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { SearchInput } from "../../components/ui/SearchInput";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import { PROMOTION_DAY_LABELS, PROMOTION_TYPES, PROMOTION_TYPE_LABELS, type PromotionRow, type PromotionType } from "../../api/promotionsApi";
import { PromotionFormModal } from "./PromotionFormModal";

/** Reference: Promotions > Promotions (promotions/index.blade.php, PromotionsController@index). */
export default function PromotionsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PromotionType | "">("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filterParams = { search: search.trim() || undefined, type: type || undefined };
  const { data, isFetching } = useQuery({
    queryKey: ["promotions", "list", filterParams, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PromotionRow[]>>("/promotions", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const rows = data?.rows ?? [];

  const done = (msg: string) => {
    setError(null);
    setNotice(msg);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["promotions"] });
    qc.invalidateQueries({ queryKey: ["pos", "promotions"] });
  };
  const fail = (err: unknown) => setError(errorMessage(err, isAr));
  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => done(isAr ? "حذف بنجاح" : "Deleted Successfully"),
    onError: fail,
  });
  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/promotions/${id}/activate`),
    onSuccess: () => done(isAr ? "تم التحديث بنجاح" : "Updated Successfully"),
    onError: fail,
  });
  const deactivateMutation = useMutation({
    mutationFn: (ids: string[]) => api.post("/promotions/mass-deactivate", { ids }),
    onSuccess: () => done(isAr ? "تم إلغاء تنشيطه بنجاح" : "Deactivated successfully"),
    onError: fail,
  });

  const typeLabel = (v: PromotionType) => PROMOTION_TYPE_LABELS[v][isAr ? "ar" : "en"];
  const dayLabel = (d: string) => PROMOTION_DAY_LABELS[d as keyof typeof PROMOTION_DAY_LABELS]?.[isAr ? "ar" : "en"] ?? d;
  const date = (v: string | null) => (v ? v.slice(0, 10) : "");
  const periodText = (p: { from: string; to: string }) => `${isAr ? "من" : "From"}: ${p.from} ${isAr ? "إلى" : "To"}: ${p.to}`;
  const chips = (values: string[]) =>
    values.length ? (
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="info">
            <span className="ltr-nums">{v}</span>
          </Badge>
        ))}
      </div>
    ) : (
      "-"
    );

  const columns: { key: string; label: string; render: (r: PromotionRow) => ReactNode; exportValue: (r: PromotionRow) => string | number | null }[] = [
    {
      key: "name",
      label: isAr ? "الإسم" : "Name",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-800">{r.name}</span>
          {!r.isActive && <Badge variant="warning">{isAr ? "غير نشط" : "Inactive"}</Badge>}
          {r.autoApply && <Badge variant="info">{isAr ? "تطبيق تلقائي" : "Auto apply"}</Badge>}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    { key: "type", label: isAr ? "نوع" : "Type", render: (r) => typeLabel(r.type), exportValue: (r) => typeLabel(r.type) },
    { key: "startsAt", label: isAr ? "يبدأ في" : "Starts At", render: (r) => <span className="ltr-nums">{date(r.startsAt)}</span>, exportValue: (r) => date(r.startsAt) },
    { key: "endsAt", label: isAr ? "ينتهي عند" : "Ends At", render: (r) => <span className="ltr-nums">{date(r.endsAt)}</span>, exportValue: (r) => date(r.endsAt) },
    { key: "days", label: isAr ? "الأيام" : "Days", render: (r) => chips(r.days.map(dayLabel)), exportValue: (r) => r.days.map(dayLabel).join(", ") },
    {
      key: "periods",
      label: isAr ? "الفترات" : "Periods",
      render: (r) => chips((r.periods ?? []).map(periodText)),
      exportValue: (r) => (r.periods ?? []).map(periodText).join(", "),
    },
    { key: "priority", label: isAr ? "أفضلية" : "Priority", render: (r) => <span className="ltr-nums">{r.priority ?? ""}</span>, exportValue: (r) => r.priority },
  ];
  const visibility = useColumnVisibility(
    "promotions",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => visibility.isVisible(c.key));
  const canUpdate = can("promotions.update");
  const canDelete = can("promotions.delete");
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const td = "px-4 py-3 align-top";
  const title = isAr ? "العروض الترويجية" : "Promotions";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        actions={
          can("promotions.create") ? (
            <Button onClick={() => setEditing({ id: null })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة" : "Add"}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && !error && <Alert variant="success">{notice}</Alert>}

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard icon={BadgePercent} cardBg="bg-app-pos-500" iconBg="bg-white/20" iconColor="text-white" highlight label={title} value={String(data.meta.total)} />
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
            placeholder={isAr ? "بحث" : "Search"}
            className="max-w-xs"
          />
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as PromotionType | "");
              setPage(1);
            }}
            className={cn(selectClass, "max-w-[14rem]")}
            aria-label={isAr ? "نوع" : "Type"}
          >
            <option value="">{isAr ? "كل الأنواع" : "All types"}</option>
            {PROMOTION_TYPES.map((v) => (
              <option key={v} value={v}>
                {typeLabel(v)}
              </option>
            ))}
          </select>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu columns={columns.map((c) => ({ key: c.key, label: c.label }))} isVisible={visibility.isVisible} onToggle={visibility.toggle} isAr={isAr} />
            <TableExportButtons
              title={title}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<PromotionRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<PromotionRow[]>>("/promotions", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((r) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(r)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {canUpdate && (
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))}
                      aria-label={isAr ? "تحديد الكل" : "Select all"}
                    />
                  </Th>
                )}
                {visibleColumns.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>{isAr ? "خيار" : "Action"}</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  {canUpdate && (
                    <td className={td}>
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={r.name} />
                    </td>
                  )}
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={td}>
                      {c.render(r)}
                    </td>
                  ))}
                  <td className={td}>
                    <RowActions align="start">
                      {canUpdate && <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => setEditing({ id: r.id })} />}
                      {canDelete && (
                        <RowActionButton
                          icon={Trash2}
                          label={isAr ? "حذف" : "Delete"}
                          variant="danger"
                          onClick={async () => {
                            if (await confirmAction({ message: isAr ? `حذف العرض "${r.name}"؟` : `Delete the promotion "${r.name}"?`, danger: true })) removeMutation.mutate(r.id);
                          }}
                        />
                      )}
                      {canUpdate && !r.isActive && (
                        <RowActionButton icon={Power} label={isAr ? "إعادة التنشيط" : "Reactivate"} variant="success" onClick={() => activateMutation.mutate(r.id)} />
                      )}
                    </RowActions>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-4 py-8 text-center text-slate-400">
                    {isFetching ? (isAr ? "جارٍ التحميل..." : "Loading...") : isAr ? "لا توجد سجلات" : "No records found"}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
        {canUpdate && (
          <div className="border-t border-slate-100 px-4 py-3">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!selected.length) {
                  setError(isAr ? "لم يتم تحديد أي صف" : "No row selected");
                  return;
                }
                if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?", danger: true })) deactivateMutation.mutate(selected);
              }}
            >
              <Power className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إلغاء التفعيل" : "Deactivate Selected"}
              {selected.length > 0 && <span className="ltr-nums"> ({selected.length})</span>}
            </Button>
          </div>
        )}
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

      {editing && (
        <PromotionFormModal
          id={editing.id}
          isAr={isAr}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            done(msg);
          }}
        />
      )}
    </div>
  );
}
