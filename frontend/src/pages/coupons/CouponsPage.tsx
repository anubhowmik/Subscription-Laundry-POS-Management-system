import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, FileUp, Pencil, Plus, Power, Ticket, Trash2, Upload } from "lucide-react";
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
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { SearchInput } from "../../components/ui/SearchInput";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import { FilterField } from "../reports/reportShared";
import { PROMOTION_DAY_LABELS } from "../../api/promotionsApi";
import type { CouponRow } from "../../api/couponsApi";
import { CouponFormModal } from "./CouponFormModal";

/** The reference import template's 22 columns (coupon/import.blade.php), in order. */
const IMPORT_COLUMNS: { name: string; required: boolean; en: string; ar: string; example?: string }[] = [
  { name: "COUPON NAME", required: true, en: "", ar: "" },
  { name: "COUPON CODE", required: false, en: "If empty then it will be generated", ar: "إذا كان فارغاً سيتم توليده" },
  { name: "SALES AMOUNT", required: false, en: "Minimum invoice total (the matching products' total when products are set)", ar: "الحد الأدنى لمبلغ الفاتورة" },
  { name: "CUSTOMER LIMIT", required: false, en: "Usage limit per customer", ar: "حد الاستخدام لكل عميل" },
  { name: "COUPON LIMIT", required: false, en: "Usage limit per coupon", ar: "الحد الأقصى لاستخدام القسيمة" },
  { name: "LOCATION GROUPS", required: false, en: "Group names, comma separated", ar: "أسماء المجموعات مفصولة بفاصلة", example: "Riyadh,Jeddah" },
  { name: "LOCATIONS", required: false, en: "Branch names or codes", ar: "أسماء الفروع أو أكوادها", example: "Riyadh 001,Riyadh 002" },
  { name: "CUSTOMER GROUPS", required: false, en: "Customer group names", ar: "أسماء مجموعات العملاء", example: "Aramco,Fly Nas" },
  { name: "CUSTOMERS", required: false, en: "Customer IDs", ar: "أرقام العملاء", example: "CUST-00002,CUST-00006" },
  { name: "EXCLUDE CUSTOMERS", required: false, en: "Customer IDs", ar: "أرقام العملاء", example: "CUST-00003,CUST-00004" },
  { name: "PRODUCT CATEGORIES", required: false, en: "Main category / service category names", ar: "أسماء الأصناف" },
  { name: "PRODUCT BRANDS", required: false, en: "Brand names", ar: "أسماء العلامات التجارية" },
  { name: "PRODUCTS", required: false, en: "Product SKUs / service codes", ar: "أكواد المنتجات / الخدمات", example: "RH044_D,RH044_I" },
  { name: "STARTS AT", required: false, en: "Date", ar: "تاريخ", example: "20-8-2022" },
  { name: "ENDS AT", required: false, en: "Date", ar: "تاريخ", example: "20-9-2022" },
  { name: "DAYS", required: false, en: "Day names", ar: "أسماء الأيام", example: "Sat,Sun" },
  { name: "TIMES", required: false, en: "From-To times", ar: "من - إلى", example: "10:00-11:00,12:00-13:00" },
  { name: "DISCOUNT TYPE", required: true, en: "fixed or percentage", ar: "fixed أو percentage", example: "fixed" },
  { name: "DISCOUNT AMOUNT", required: true, en: "", ar: "" },
  { name: "MAX DISCOUNT", required: false, en: "Caps a percentage coupon", ar: "حد أقصى لقسيمة النسبة" },
  { name: "ADDED DISCOUNT", required: false, en: "1 or 0 ... Default = 0", ar: "1 أو 0 ... الافتراضي = 0" },
  { name: "IS ACTIVE", required: false, en: "1 or 0 ... Default = 1", ar: "1 أو 0 ... الافتراضي = 1" },
];

/** Reference: Promotions > Coupons (coupon/index.blade.php + import.blade.php, CouponController). */
export default function CouponsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const [tab, setTab] = useState<"all" | "import">("all");
  const canCreate = can("coupons.create") || can("coupons.manage");
  const title = isAr ? "قسائم الخصم" : "Coupons";

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={isAr ? "إدارة القسائم" : "Manage Coupons"} />
      <div className="flex gap-6 border-b border-slate-200">
        {(
          [
            ["all", Ticket, isAr ? "جميع القسائم" : "All Coupons"],
            ...(canCreate ? ([["import", FileUp, isAr ? "استيراد قسائم الشراء" : "Import Coupons"]] as const) : []),
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors",
              tab === key ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden /> {label}
          </button>
        ))}
      </div>
      {tab === "all" ? <AllCoupons isAr={isAr} /> : <ImportCoupons isAr={isAr} onDone={() => setTab("all")} />}
    </div>
  );
}

function AllCoupons({ isAr }: { isAr: boolean }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; bulk?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filterParams = { search: search.trim() || undefined, status: status || undefined };
  const { data, isFetching } = useQuery({
    queryKey: ["coupons", "list", filterParams, page, limit],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CouponRow[]>>("/coupons", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const rows = data?.rows ?? [];

  const done = (msg: string) => {
    setError(null);
    setNotice(msg);
    setSelected([]);
    qc.invalidateQueries({ queryKey: ["coupons"] });
  };
  const fail = (err: unknown) => setError(errorMessage(err, isAr));
  const removeMutation = useMutation({ mutationFn: (id: string) => api.delete(`/coupons/${id}`), onSuccess: () => done(isAr ? "حذف بنجاح" : "Deleted Successfully"), onError: fail });
  const activateMutation = useMutation({ mutationFn: (id: string) => api.post(`/coupons/${id}/activate`), onSuccess: () => done(isAr ? "تم التحديث بنجاح" : "Updated Successfully"), onError: fail });
  const deactivateMutation = useMutation({
    mutationFn: (ids: string[]) => api.post("/coupons/mass-deactivate", { ids }),
    onSuccess: () => done(isAr ? "تم إلغاء تنشيطه بنجاح" : "Deactivated successfully"),
    onError: fail,
  });

  const dayLabel = (d: string) => PROMOTION_DAY_LABELS[d as keyof typeof PROMOTION_DAY_LABELS]?.[isAr ? "ar" : "en"] ?? d;
  const date = (v: string | null) => (v ? v.slice(0, 10) : "");
  const periodText = (p: { from: string; to: string }) => `${isAr ? "من" : "From"}: ${p.from} ${isAr ? "إلى" : "To"}: ${p.to}`;
  const discountText = (r: CouponRow) => (r.discountMode === "PERCENT" ? `${Number(r.discountValue)}%` : Number(r.discountValue).toFixed(2));
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

  const columns: { key: string; label: string; render: (r: CouponRow) => ReactNode; exportValue: (r: CouponRow) => string | number | null }[] = [
    {
      key: "name",
      label: isAr ? "الإسم" : "Name",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-800">{r.name}</span>
          {!r.isActive && <Badge variant="warning">{isAr ? "غير نشط" : "Inactive"}</Badge>}
          {r.otp && <Badge variant="neutral">OTP</Badge>}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    { key: "code", label: isAr ? "قسيمة خصم" : "Coupon", render: (r) => <span className="font-mono text-slate-700">{r.code}</span>, exportValue: (r) => r.code },
    { key: "discount", label: isAr ? "مبلغ الخصم" : "Discount Amount", render: (r) => <span className="ltr-nums">{discountText(r)}</span>, exportValue: discountText },
    { key: "validFrom", label: isAr ? "يبدأ في" : "Starts At", render: (r) => <span className="ltr-nums">{date(r.validFrom)}</span>, exportValue: (r) => date(r.validFrom) },
    { key: "validUntil", label: isAr ? "ينتهي عند" : "Ends At", render: (r) => <span className="ltr-nums">{date(r.validUntil)}</span>, exportValue: (r) => date(r.validUntil) },
    { key: "days", label: isAr ? "الأيام" : "Days", render: (r) => chips(r.days.map(dayLabel)), exportValue: (r) => r.days.map(dayLabel).join(", ") },
    { key: "periods", label: isAr ? "الفترات" : "Periods", render: (r) => chips((r.periods ?? []).map(periodText)), exportValue: (r) => (r.periods ?? []).map(periodText).join(", ") },
    {
      key: "used",
      label: isAr ? "مرات الاستخدام" : "Used",
      render: (r) => <span className="ltr-nums">{r.maxUses != null ? `${r.usedCount} / ${r.maxUses}` : r.usedCount}</span>,
      exportValue: (r) => r.usedCount,
    },
  ];
  const visibility = useColumnVisibility(
    "coupons",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => visibility.isVisible(c.key));
  const canUpdate = can("coupons.update") || can("coupons.manage");
  const canDelete = can("coupons.delete") || can("coupons.manage");
  const canCreate = can("coupons.create") || can("coupons.manage");
  const allOnPage = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const td = "px-4 py-3 align-top";
  const title = isAr ? "قسائم الخصم" : "Coupons";

  return (
    <div className="space-y-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {notice && !error && <Alert variant="success">{notice}</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {data?.meta && (
          <div className="w-full sm:max-w-xs">
            <StatCard icon={Ticket} cardBg="bg-app-pos-500" iconBg="bg-white/20" iconColor="text-white" highlight label={title} value={String(data.meta.total)} />
          </div>
        )}
        {canCreate && (
          <div className="ms-auto flex gap-2">
            <Button onClick={() => setEditing({ id: null })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة" : "Add"}
            </Button>
            <Button variant="outline" onClick={() => setEditing({ id: null, bulk: true })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة بالجملة" : "Add Bulk"}
            </Button>
          </div>
        )}
      </div>

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
          <FiltersMenu
            activeCount={status ? 1 : 0}
            onClear={() => {
              setStatus("");
              setPage(1);
            }}
            isAr={isAr}
          >
            <FilterField label={isAr ? "الحالة" : "Status"}>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="active">{isAr ? "مفعل" : "Active"}</option>
                <option value="inactive">{isAr ? "غير نشط" : "Inactive"}</option>
              </select>
            </FilterField>
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
            <ColumnVisibilityMenu columns={columns.map((c) => ({ key: c.key, label: c.label }))} isVisible={visibility.isVisible} onToggle={visibility.toggle} isAr={isAr} />
            <TableExportButtons
              title={title}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<CouponRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<CouponRow[]>>("/coupons", { params: { ...filterParams, page: p, limit: l } });
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
                    <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? [] : rows.map((r) => r.id))} aria-label={isAr ? "تحديد الكل" : "Select all"} />
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
                            if (await confirmAction({ message: isAr ? `حذف القسيمة "${r.name}"؟` : `Delete the coupon "${r.name}"?`, danger: true })) removeMutation.mutate(r.id);
                          }}
                        />
                      )}
                      {canUpdate && !r.isActive && <RowActionButton icon={Power} label={isAr ? "إعادة التنشيط" : "Reactivate"} variant="success" onClick={() => activateMutation.mutate(r.id)} />}
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
        <CouponFormModal
          id={editing.id}
          bulk={editing.bulk}
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

function ImportCoupons({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      return (await api.post<ApiSuccess<{ imported: number; errors: { row: number; message: string }[] }>>("/coupons/import", formData)).data.data;
    },
    onSuccess: (data) => {
      setError(null);
      setResult(data);
      if (data.imported > 0) {
        qc.invalidateQueries({ queryKey: ["coupons"] });
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    onError: (err) => {
      setResult(null);
      setError(errorMessage(err, isAr));
    },
  });

  // Reference "Download template file": the 22 headers plus one example row.
  const downloadTemplate = () => {
    const example = IMPORT_COLUMNS.map((c) => c.example ?? (c.name === "COUPON NAME" ? "Summer 10%" : c.name === "DISCOUNT AMOUNT" ? "10" : ""));
    const csv = [IMPORT_COLUMNS.map((c) => c.name).join(","), example.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",")].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "import-coupons-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملف للاستيراد" : "File To Import"}</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700 hover:file:bg-sky-100"
            />
          </div>
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
            <Upload className="h-4 w-4" strokeWidth={2} aria-hidden /> {upload.isPending ? "…" : isAr ? "إرسال" : "Submit"}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "تنزيل ملف القالب" : "Download template file"}
          </Button>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}
        {result && result.errors.length > 0 && (
          <Alert variant="danger">
            <p className="font-semibold">{isAr ? "لم يتم استيراد أي قسيمة - صحح الأخطاء ثم حاول مرة أخرى:" : "Nothing was imported - fix these and try again:"}</p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.row > 0 && (
                    <span className="ltr-nums">
                      {isAr ? "صف" : "Row"} {e.row}:{" "}
                    </span>
                  )}
                  {e.message}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {result && result.imported > 0 && (
          <Alert variant="success">
            {isAr ? `تم استيراد ${result.imported} قسيمة بنجاح.` : `${result.imported} coupons imported successfully.`}{" "}
            <button type="button" onClick={onDone} className="font-semibold underline">
              {isAr ? "عرض القسائم" : "View coupons"}
            </button>
          </Alert>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800">{isAr ? "تعليمات" : "Instructions"}</h3>
        <p className="mt-1 text-sm font-medium text-slate-700">{isAr ? "اتبع التعليمات بعناية قبل استيراد الملف." : "Follow the instructions carefully before importing the file."}</p>
        <p className="text-sm text-slate-500">{isAr ? "يجب أن تكون الأعمدة في الملف بالترتيب التالي." : "The columns of the file should be in the following order."}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-start text-xs uppercase text-slate-500">
                <th className="px-3 py-2 text-start">{isAr ? "رقم العمود" : "Column Number"}</th>
                <th className="px-3 py-2 text-start">{isAr ? "اسم العمود" : "Column Name"}</th>
                <th className="px-3 py-2 text-start">{isAr ? "تعليمات" : "Instruction"}</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((c, i) => (
                <tr key={c.name} className="border-b border-slate-100 last:border-0">
                  <td className="ltr-nums px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {c.name} <small className="font-normal text-slate-400">({c.required ? (isAr ? "مطلوب" : "Required") : isAr ? "اختياري" : "Optional"})</small>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {isAr ? c.ar : c.en}
                    {c.example && <span className="ltr-nums ms-1 text-xs text-slate-400">{c.example}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
