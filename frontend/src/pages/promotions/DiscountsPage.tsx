import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BadgePercent, CalendarClock, Pencil, Plus, Power, Tag, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { confirmAction } from "../../stores/confirmStore";
import { fetchAllRows } from "../../lib/tableExport";
import { cn } from "../../lib/cn";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { StatCard } from "../../components/ui/StatCard";
import { SearchInput } from "../../components/ui/SearchInput";
import { Pagination } from "../../components/ui/Pagination";
import { FormSection, RequiredMark } from "../../components/ui/FormSection";
import { MultiSelectDropdown } from "../../components/ui/MultiSelectDropdown";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import { useDiscountFormOptions, type DiscountRow } from "../../api/discountsApi";

const pickName = (x: { nameEn: string; nameAr: string | null }, isAr: boolean) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
/** ISO -> the `datetime-local` input's local "YYYY-MM-DDTHH:mm". */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtDateTime = (iso: string) => toLocalInput(iso).replace("T", " ");

/** Reference: Promotions > Discounts (discount/index.blade.php, DiscountController@index). */
export default function DiscountsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ row: DiscountRow | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filterParams = { search: search.trim() || undefined };
  const { data, isFetching } = useQuery({
    queryKey: ["discounts", "list", filterParams, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<DiscountRow[]>>("/discounts", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const rows = data?.rows ?? [];

  const done = (msg: string) => {
    setError(null);
    setNotice(msg);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["discounts"] });
  };
  const fail = (err: unknown) => setError(errorMessage(err, isAr));
  const removeMutation = useMutation({ mutationFn: (id: string) => api.delete(`/discounts/${id}`), onSuccess: () => done(isAr ? "حذف بنجاح" : "Deleted Successfully"), onError: fail });
  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/discounts/${id}/activate`),
    onSuccess: () => done(isAr ? "تم التحديث بنجاح" : "Updated Successfully"),
    onError: fail,
  });
  const deactivateMutation = useMutation({
    mutationFn: (ids: string[]) => api.post("/discounts/mass-deactivate", { ids }),
    onSuccess: () => done(isAr ? "تم إلغاء تنشيطه بنجاح" : "Deactivated successfully"),
    onError: fail,
  });

  const amount = (r: DiscountRow) => `${Number(r.discountAmount).toLocaleString("en-US", { maximumFractionDigits: 2 })}${r.discountType === "PERCENTAGE" ? " %" : ""}`;
  const location = (r: DiscountRow) => `${isAr ? r.businessLocation.branchNameAr || r.businessLocation.branchName : r.businessLocation.branchName} (${r.businessLocation.branchCode})`;
  const products = (r: DiscountRow) => r.items.map((i) => `${pickName(i, isAr)}${i.code ? ` (${i.code})` : ""}`);
  const columns: { key: string; label: string; render: (r: DiscountRow) => ReactNode; exportValue: (r: DiscountRow) => string | number | null }[] = [
    {
      key: "name",
      label: isAr ? "الإسم" : "Name",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-800">{r.name}</span>
          {!r.isActive && <Badge variant="warning">{isAr ? "غير نشط" : "Inactive"}</Badge>}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    { key: "startsAt", label: isAr ? "يبدأ في" : "Starts At", render: (r) => <span className="ltr-nums">{fmtDateTime(r.startsAt)}</span>, exportValue: (r) => fmtDateTime(r.startsAt) },
    { key: "endsAt", label: isAr ? "ينتهي عند" : "Ends At", render: (r) => <span className="ltr-nums">{fmtDateTime(r.endsAt)}</span>, exportValue: (r) => fmtDateTime(r.endsAt) },
    { key: "discountAmount", label: isAr ? "مبلغ الخصم" : "Discount Amount", render: (r) => <span className="ltr-nums">{amount(r)}</span>, exportValue: amount },
    { key: "priority", label: isAr ? "أفضلية" : "Priority", render: (r) => <span className="ltr-nums">{r.priority ?? ""}</span>, exportValue: (r) => r.priority },
    { key: "brand", label: isAr ? "العلامة التجارية" : "Brand", render: (r) => (r.brand ? pickName(r.brand, isAr) : ""), exportValue: (r) => (r.brand ? pickName(r.brand, isAr) : "") },
    { key: "category", label: isAr ? "الصنف" : "Category", render: (r) => (r.category ? pickName(r.category, isAr) : ""), exportValue: (r) => (r.category ? pickName(r.category, isAr) : "") },
    {
      key: "products",
      label: isAr ? "المنتجات" : "Products",
      render: (r) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {products(r).map((p) => (
            <Badge key={p} variant="info">
              {p}
            </Badge>
          ))}
        </div>
      ),
      exportValue: (r) => products(r).join(", "),
    },
    { key: "location", label: isAr ? "الفرع" : "Location", render: location, exportValue: location },
  ];
  const visibility = useColumnVisibility(
    "discounts",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => visibility.isVisible(c.key));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const td = "px-4 py-3 align-top";
  const title = isAr ? "الخصم" : "Discount";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        actions={
          <Button onClick={() => setEditing({ row: null })}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة" : "Add"}
          </Button>
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && !error && <Alert variant="success">{notice}</Alert>}
      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard icon={BadgePercent} cardBg="bg-app-pos-500" iconBg="bg-white/20" iconColor="text-white" highlight label={isAr ? "جميع خصوماتك" : "All your discounts"} value={String(data.meta.total)} />
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
                const all = await fetchAllRows<DiscountRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<DiscountRow[]>>("/discounts", { params: { ...filterParams, page: p, limit: l } });
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
                <Th className="w-10">
                  <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} aria-label={isAr ? "تحديد الكل" : "Select all"} />
                </Th>
                {visibleColumns.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>{isAr ? "خيار" : "Action"}</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className={td}>
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} aria-label={r.name} />
                  </td>
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={td}>
                      {c.render(r)}
                    </td>
                  ))}
                  <td className={td}>
                    <RowActions align="start">
                      <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => setEditing({ row: r })} />
                      <RowActionButton
                        icon={Trash2}
                        label={isAr ? "حذف" : "Delete"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `حذف الخصم "${r.name}"؟` : `Delete the discount "${r.name}"?`, danger: true })) removeMutation.mutate(r.id);
                        }}
                      />
                      {!r.isActive && <RowActionButton icon={Power} label={isAr ? "إعادة التنشيط" : "Reactivate"} variant="success" onClick={() => activateMutation.mutate(r.id)} />}
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
        <div className="border-t border-slate-100 px-4 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!selected.length) return setError(isAr ? "لم يتم تحديد أي صف" : "No row selected");
              if (await confirmAction({ message: isAr ? "هل أنت متأكد؟" : "Are you sure?", danger: true })) deactivateMutation.mutate(selected);
            }}
          >
            <Power className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إلغاء التفعيل" : "Deactivate Selected"}
            {selected.length > 0 && <span className="ltr-nums"> ({selected.length})</span>}
          </Button>
        </div>
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
        <DiscountFormModal
          row={editing.row}
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

/** Reference discount/create.blade.php + edit.blade.php. */
function DiscountFormModal({ row, isAr, onClose, onSaved }: { row: DiscountRow | null; isAr: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const { t } = useTranslation();
  const { data: options } = useDiscountFormOptions();
  // Service POS and Product POS are separate apps - each only offers its own items/categories.
  const appKey = useCurrentApp()?.key;
  const appKind = appKey === "posService" ? "SERVICE" : appKey === "posProduct" ? "PRODUCT" : null;
  const inApp = (x: { kind: "PRODUCT" | "SERVICE" }) => !appKind || x.kind === appKind;
  const [name, setName] = useState(row?.name ?? "");
  const [itemKeys, setItemKeys] = useState<string[]>(row?.itemKeys ?? []);
  const [brandId, setBrandId] = useState(row?.brandId ?? "");
  const [categoryKey, setCategoryKey] = useState(row?.categoryKey ?? "");
  const [locationId, setLocationId] = useState(row?.businessLocationId ?? "");
  const [priority, setPriority] = useState(row?.priority != null ? String(row.priority) : "");
  const [discountType, setDiscountType] = useState<"" | "FIXED" | "PERCENTAGE">(row?.discountType ?? "");
  const [discountAmount, setDiscountAmount] = useState(row ? String(Number(row.discountAmount)) : "");
  const [startsAt, setStartsAt] = useState(row ? toLocalInput(row.startsAt) : "");
  const [endsAt, setEndsAt] = useState(row ? toLocalInput(row.endsAt) : "");
  const [priceListId, setPriceListId] = useState(row?.priceListId ?? "");
  const [applicableInCg, setApplicableInCg] = useState(row?.applicableInCg ?? false);
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        itemKeys,
        brandId: itemKeys.length ? null : brandId || null,
        categoryKey: itemKeys.length ? null : categoryKey || null,
        businessLocationId: locationId,
        priority: priority.trim() === "" ? null : Number(priority),
        discountType,
        discountAmount: Number(discountAmount),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        priceListId: priceListId || null,
        applicableInCg,
        isActive,
      };
      return row ? api.put(`/discounts/${row.id}`, body) : api.post("/discounts", body);
    },
    onSuccess: () => onSaved(row ? (isAr ? "تم التحديث بنجاح" : "Updated Successfully") : isAr ? "اضيف بنجاح" : "Added Successfully"),
    onError: (err) => setError(errorMessage(err, isAr)),
  });
  const pick = isAr ? "يرجى الاختيار" : "Please Select";
  const canSubmit = name.trim() && locationId && discountType && Number(discountAmount) > 0 && startsAt && endsAt && !save.isPending;
  const req = (label: string, input: ReactNode) => (
    <div>
      <label className={labelClass}>
        {label}
        <RequiredMark />
      </label>
      {input}
    </div>
  );
  const field = (label: string, input: ReactNode) => (
    <div>
      <label className={labelClass}>{label}</label>
      {input}
    </div>
  );

  return (
    <Modal title={row ? (isAr ? "تعديل الخصم" : "Edit Discount") : isAr ? "إضافة الخصم" : "Add Discount"} onClose={onClose} size="xl">
      <div className="space-y-4">
        <FormSection title={isAr ? "الخصم" : "Discount"} icon={Tag}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{req(isAr ? "الإسم" : "Name", <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isAr ? "الإسم" : "Name"} autoFocus className={inputClass} />)}</div>
            <div className="sm:col-span-2">
              {field(
                isAr ? "المنتجات" : "Products",
                <MultiSelectDropdown
                  options={(options?.items ?? []).filter(inApp).map((i) => ({ value: i.key, label: `${pickName(i, isAr)}${i.code ? ` (${i.code})` : ""}` }))}
                  value={itemKeys}
                  onChange={setItemKeys}
                  placeholder={pick}
                  isAr={isAr}
                  searchable
                />,
              )}
            </div>
            {/* Reference: picking products hides Brand and Category. */}
            {itemKeys.length === 0 && (
              <>
                {appKind !== "SERVICE" &&
                  field(
                    isAr ? "العلامة التجارية" : "Brand",
                    <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectClass}>
                      <option value="">{pick}</option>
                      {(options?.brands ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {pickName(b, isAr)}
                        </option>
                      ))}
                    </select>,
                  )}
                {field(
                  isAr ? "الصنف" : "Category",
                  <select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} className={selectClass}>
                    <option value="">{pick}</option>
                    {(options?.categories ?? []).filter(inApp).map((c) => (
                      <option key={c.key} value={c.key}>
                        {pickName(c, isAr)}
                      </option>
                    ))}
                  </select>,
                )}
              </>
            )}
            {req(
              isAr ? "الفرع" : "Location",
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={selectClass}>
                <option value="">{pick}</option>
                {(options?.locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {(isAr ? l.branchNameAr || l.branchName : l.branchName) + ` (${l.branchCode})`}
                  </option>
                ))}
              </select>,
            )}
            {field(
              isAr ? "أفضلية" : "Priority",
              <input
                type="number"
                step="1"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder={isAr ? "أفضلية" : "Priority"}
                title={isAr ? "الخصم ذو الأولوية الأعلى سيكون له وزن أعلى" : "Discount with higher priority will have higher weightage"}
                className={cn(inputClass, "ltr-nums")}
              />,
            )}
            {req(
              isAr ? "نوع الخصم" : "Discount Type",
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as typeof discountType)} className={selectClass}>
                <option value="">{pick}</option>
                <option value="FIXED">{isAr ? "ثابت" : "Fixed"}</option>
                <option value="PERCENTAGE">{isAr ? "النسبة المئوية" : "Percentage"}</option>
              </select>,
            )}
            {req(
              isAr ? "مبلغ الخصم" : "Discount Amount",
              <input
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder={isAr ? "مبلغ الخصم" : "Discount Amount"}
                className={cn(inputClass, "ltr-nums")}
              />,
            )}
          </div>
        </FormSection>
        <FormSection title={isAr ? "وقت التفعيل" : "Activation Time"} icon={CalendarClock}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {req(isAr ? "يبدأ في" : "Starts At", <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(inputClass, "ltr-nums")} />)}
            {req(isAr ? "ينتهي عند" : "Ends At", <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={cn(inputClass, "ltr-nums")} />)}
            {field(
              isAr ? "مجموعة أسعار البيع" : "Selling Price Group",
              <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(options?.priceLists ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {pickName(p, isAr)}
                  </option>
                ))}
              </select>,
            )}
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={applicableInCg} onChange={(e) => setApplicableInCg(e.target.checked)} />
                {isAr ? "تطبيق على مجموعات العملاء" : "Apply in customer groups"}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                {isAr ? "مفعل" : "Active"}
              </label>
            </div>
          </div>
        </FormSection>
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
          <Button type="button" fullWidth disabled={!canSubmit} onClick={() => save.mutate()}>
            {save.isPending ? "…" : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
