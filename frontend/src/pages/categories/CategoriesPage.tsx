import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Boxes, Pencil, Plus, Power, Shirt, Tags, Target } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { FormSection } from "../../components/ui/FormSection";
import { SearchInput } from "../../components/ui/SearchInput";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";

type Status = "ACTIVE" | "INACTIVE";
interface ProductCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  code: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  parentId: string | null;
  parent: { nameEn: string; nameAr: string } | null;
  target: string | null;
  targetMtd: string | null;
  status: Status;
}
interface ServiceCategory {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  target: string | null;
  targetMtd: string | null;
  status: Status;
  _count: { services: number };
}
type Kind = "product" | "service";

const money = (v: string | null) => (v === null ? "-" : <span className="ltr-nums">{Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>);

/**
 * Reference: Products > Categories (taxonomy index/create/edit). Product categories are two levels
 * deep (main category + sub-category); service categories group laundry services. Main categories
 * carry the reference's sales targets (Target / Target MTD) used by Sales Reports > Sales Performance.
 */
export default function CategoriesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  // Mirror the backend: product categories are served to POS Laundry / Product POS, service
  // categories to POS Laundry / Service POS (category.routes / serviceCategory.routes).
  // Service POS and Product POS are separate apps: each only manages its own kind of category.
  const appKey = useCurrentApp()?.key;
  const canProducts = appKey !== "posService" && can("categories.view") && can("app.pos_laundry", "app.pos_product");
  const canServices = appKey !== "posProduct" && can("services.view") && can("app.pos_laundry", "app.pos_service");
  const [kind, setKind] = useState<Kind>(canProducts ? "product" : "service");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ kind: Kind; row: ProductCategory | ServiceCategory | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: productCategories, isLoading: loadingProducts } = useQuery({
    queryKey: ["categories", "manage"],
    queryFn: async () => (await api.get<ApiSuccess<ProductCategory[]>>("/categories", { params: { limit: 1000, sortBy: "nameEn", sortOrder: "asc" } })).data.data,
    enabled: canProducts,
  });
  const { data: serviceCategories, isLoading: loadingServices } = useQuery({
    queryKey: ["service-categories", "manage"],
    queryFn: async () => (await api.get<ApiSuccess<ServiceCategory[]>>("/service-categories", { params: { includeInactive: "true" } })).data.data,
    enabled: canServices,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ kind, id, status }: { kind: Kind; id: string; status: Status }) => api.put(`/${kind === "product" ? "categories" : "service-categories"}/${id}`, { status }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["service-categories"] });
      qc.invalidateQueries({ queryKey: ["pos"] });
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  const name = (x: { nameEn: string; nameAr: string }) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  const q = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) => !q || values.some((v) => (v ?? "").toLowerCase().includes(q));
  // Main categories first, each followed by its sub-categories.
  const productRows = (() => {
    const all = (productCategories ?? []).filter((c) => matches(c.nameEn, c.nameAr, c.code));
    const mains = all.filter((c) => !c.parentId);
    const children = (id: string) => all.filter((c) => c.parentId === id);
    const orphans = all.filter((c) => c.parentId && !mains.some((m) => m.id === c.parentId));
    return [...mains.flatMap((m) => [m, ...children(m.id)]), ...orphans];
  })();
  const serviceRows = (serviceCategories ?? []).filter((c) => matches(c.nameEn, c.nameAr, c.description));
  const statusBadge = (s: Status) => <Badge variant={s === "ACTIVE" ? "success" : "neutral"}>{s === "ACTIVE" ? (isAr ? "نشط" : "Active") : isAr ? "غير نشط" : "Inactive"}</Badge>;
  const statusAction = (k: Kind, row: { id: string; status: Status }) =>
    row.status === "ACTIVE" ? (
      <RowActionButton icon={Power} label={isAr ? "تعطيل" : "Deactivate"} variant="danger" onClick={() => statusMutation.mutate({ kind: k, id: row.id, status: "INACTIVE" })} />
    ) : (
      <RowActionButton icon={Power} label={isAr ? "تفعيل" : "Activate"} variant="success" onClick={() => statusMutation.mutate({ kind: k, id: row.id, status: "ACTIVE" })} />
    );
  const canAdd = kind === "product" ? can("categories.create") : can("services.create");
  const canEdit = kind === "product" ? can("categories.update") : can("services.update");
  const loading = kind === "product" ? loadingProducts : loadingServices;
  const rowCount = kind === "product" ? productRows.length : serviceRows.length;
  const td = "px-4 py-3";

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الفئات" : "Categories"}
        actions={
          canAdd ? (
            <Button onClick={() => setEditing({ kind, row: null })}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة" : "Add"}
            </Button>
          ) : undefined
        }
      />
      {error && <Alert variant="danger">{error}</Alert>}

      <TableContainer>
        <TableToolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isAr ? "بحث" : "Search"} className="max-w-xs" />
        </TableToolbar>
        {canProducts && canServices && (
          <div className="flex gap-6 border-b border-slate-100 px-4 pt-3">
            {(
              [
                ["product", Boxes, isAr ? "فئات المنتجات" : "Product Categories"],
                ["service", Shirt, isAr ? "فئات الخدمات" : "Service Categories"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors",
                  kind === key ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} aria-hidden /> {label}
              </button>
            ))}
          </div>
        )}
        <TableScroll>
          <Table>
            <THead>
              {kind === "product" ? (
                <tr>
                  <Th>{isAr ? "الفئة" : "Category"}</Th>
                  <Th>{isAr ? "الرمز" : "Category Code"}</Th>
                  <Th>{isAr ? "الوصف" : "Description"}</Th>
                  <Th>{isAr ? "الهدف" : "Target"}</Th>
                  <Th>{isAr ? "هدف الشهر" : "Target MTD"}</Th>
                  <Th>{isAr ? "الحالة" : "Status"}</Th>
                  <Th>{isAr ? "خيار" : "Action"}</Th>
                </tr>
              ) : (
                <tr>
                  <Th>{isAr ? "الفئة" : "Category"}</Th>
                  <Th>{isAr ? "الوصف" : "Description"}</Th>
                  <Th>{isAr ? "الخدمات" : "Services"}</Th>
                  <Th>{isAr ? "الهدف" : "Target"}</Th>
                  <Th>{isAr ? "هدف الشهر" : "Target MTD"}</Th>
                  <Th>{isAr ? "الحالة" : "Status"}</Th>
                  <Th>{isAr ? "خيار" : "Action"}</Th>
                </tr>
              )}
            </THead>
            <tbody>
              {kind === "product"
                ? productRows.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className={td}>
                        {c.parentId ? (
                          <span className="ps-5 text-slate-600">
                            <span className="text-slate-400">— </span>
                            {name(c)}
                          </span>
                        ) : (
                          <span className="font-medium text-slate-800">{name(c)}</span>
                        )}
                      </td>
                      <td className={td}>
                        <span className="ltr-nums">{c.code ?? "-"}</span>
                      </td>
                      <td className={cn(td, "text-slate-500")}>{(isAr ? c.descriptionAr || c.descriptionEn : c.descriptionEn) ?? "-"}</td>
                      <td className={td}>{c.parentId ? "" : money(c.target)}</td>
                      <td className={td}>{c.parentId ? "" : money(c.targetMtd)}</td>
                      <td className={td}>{statusBadge(c.status)}</td>
                      <td className={td}>
                        {canEdit && (
                          <RowActions align="start">
                            <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => setEditing({ kind: "product", row: c })} />
                            {statusAction("product", c)}
                          </RowActions>
                        )}
                      </td>
                    </tr>
                  ))
                : serviceRows.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className={cn(td, "font-medium text-slate-800")}>{name(c)}</td>
                      <td className={cn(td, "text-slate-500")}>{c.description ?? "-"}</td>
                      <td className={td}>
                        <span className="ltr-nums">{c._count.services}</span>
                      </td>
                      <td className={td}>{money(c.target)}</td>
                      <td className={td}>{money(c.targetMtd)}</td>
                      <td className={td}>{statusBadge(c.status)}</td>
                      <td className={td}>
                        {canEdit && (
                          <RowActions align="start">
                            <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => setEditing({ kind: "service", row: c })} />
                            {statusAction("service", c)}
                          </RowActions>
                        )}
                      </td>
                    </tr>
                  ))}
              {rowCount === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {loading ? (isAr ? "جارٍ التحميل..." : "Loading...") : isAr ? "لا توجد سجلات" : "No records found"}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>

      {editing && (
        <CategoryFormModal
          kind={editing.kind}
          row={editing.row}
          mainCategories={(productCategories ?? []).filter((c) => !c.parentId && c.id !== editing.row?.id)}
          hasChildren={editing.kind === "product" && !!editing.row && (productCategories ?? []).some((c) => c.parentId === editing.row!.id)}
          isAr={isAr}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryFormModal({
  kind,
  row,
  mainCategories,
  hasChildren,
  isAr,
  onClose,
}: {
  kind: Kind;
  row: ProductCategory | ServiceCategory | null;
  mainCategories: ProductCategory[];
  hasChildren: boolean;
  isAr: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const product = kind === "product" ? (row as ProductCategory | null) : null;
  const svc = kind === "service" ? (row as ServiceCategory | null) : null;
  const [nameEn, setNameEn] = useState(row?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(row?.nameAr ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [descriptionEn, setDescriptionEn] = useState(product?.descriptionEn ?? svc?.description ?? "");
  const [descriptionAr, setDescriptionAr] = useState(product?.descriptionAr ?? "");
  const [isSub, setIsSub] = useState(Boolean(product?.parentId));
  const [parentId, setParentId] = useState(product?.parentId ?? "");
  const [target, setTarget] = useState(row?.target != null ? String(Number(row.target)) : "");
  const [targetMtd, setTargetMtd] = useState(row?.targetMtd != null ? String(Number(row.targetMtd)) : "");
  const [error, setError] = useState<string | null>(null);

  // Targets belong to main categories (the report rolls sub-categories up into them).
  const showTargets = kind === "service" || !isSub;
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = useMutation({
    mutationFn: async () => {
      const targets = showTargets ? { target: num(target), targetMtd: num(targetMtd) } : { target: null, targetMtd: null };
      const body =
        kind === "product"
          ? { nameEn, nameAr, code: code || undefined, descriptionEn: descriptionEn || undefined, descriptionAr: descriptionAr || undefined, parentId: isSub ? parentId : null, ...targets }
          : { nameEn, nameAr, description: descriptionEn || undefined, ...targets };
      const base = kind === "product" ? "/categories" : "/service-categories";
      return row ? api.put(`${base}/${row.id}`, body) : api.post(base, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["service-categories"] });
      qc.invalidateQueries({ queryKey: ["pos"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });
  const invalidNumber = [target, targetMtd].some((v) => v.trim() !== "" && (Number.isNaN(Number(v)) || Number(v) < 0));
  const canSubmit = nameEn.trim() && nameAr.trim() && (!isSub || parentId) && !invalidNumber;

  return (
    <Modal
      title={row ? (isAr ? "تعديل الفئة" : "Edit Category") : isAr ? "إضافة فئة" : "Add Category"}
      subtitle={kind === "product" ? (isAr ? "فئة منتجات" : "Product category") : isAr ? "فئة خدمات" : "Service category"}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-4">
        <FormSection title={isAr ? "معلومات أساسية" : "Basic Information"} icon={Tags}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{isAr ? "اسم الفئة (إنجليزي)" : "Category Name (English)"}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder={isAr ? "اسم الفئة" : "Category name"} autoFocus className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "اسم الفئة (عربي)" : "Category Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder={isAr ? "اسم الفئة" : "Category name"} className={inputClass} />
            </div>
            {kind === "product" && (
              <div>
                <label className={labelClass}>{isAr ? "رمز الفئة" : "Category Code"}</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={isAr ? "رمز الفئة" : "Category code"} className={cn(inputClass, "ltr-nums")} />
              </div>
            )}
            <div className={kind === "product" ? "" : "sm:col-span-2"}>
              <label className={labelClass}>{isAr ? "الوصف" : "Description"}</label>
              <input value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} placeholder={isAr ? "الوصف" : "Description"} className={inputClass} />
            </div>
            {kind === "product" && (
              <div className="sm:col-span-2">
                <label className={labelClass}>{isAr ? "الوصف (عربي)" : "Description (Arabic)"}</label>
                <input value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} dir="rtl" placeholder={isAr ? "الوصف" : "Description"} className={inputClass} />
              </div>
            )}
          </div>
          {kind === "product" && (
            <div className="mt-3 space-y-2">
              <label className={cn("flex items-center gap-2 text-sm text-slate-700", hasChildren && "opacity-60")}>
                <input type="checkbox" checked={isSub} disabled={hasChildren} onChange={(e) => setIsSub(e.target.checked)} />
                {isAr ? "إضافة كفئة فرعية" : "Add as sub-category"}
              </label>
              {hasChildren && <p className="text-xs text-slate-500">{isAr ? "هذه الفئة لديها فئات فرعية، لذا لا يمكن أن تصبح فئة فرعية." : "This category has sub-categories, so it can't become one."}</p>}
              {isSub && (
                <div>
                  <label className={labelClass}>{isAr ? "اختر الفئة الرئيسية" : "Select parent category"}</label>
                  <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={selectClass}>
                    <option value="">{isAr ? "يرجى الاختيار" : "Please Select"}</option>
                    {mainCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {isAr ? c.nameAr || c.nameEn : c.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </FormSection>

        {showTargets && (
          <FormSection title={isAr ? "أهداف المبيعات" : "Sales Targets"} icon={Target} description={isAr ? "تُستخدم في تقرير أداء المبيعات" : "Used by the Sales Performance Report"}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{isAr ? "الهدف" : "Target"}</label>
                <input type="number" min={0} step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={isAr ? "الهدف" : "Target"} className={cn(inputClass, "ltr-nums")} />
              </div>
              <div>
                <label className={labelClass}>{isAr ? "هدف الشهر" : "Target MTD"}</label>
                <input type="number" min={0} step="0.01" value={targetMtd} onChange={(e) => setTargetMtd(e.target.value)} placeholder={isAr ? "هدف الشهر" : "Target MTD"} className={cn(inputClass, "ltr-nums")} />
              </div>
            </div>
          </FormSection>
        )}

        {error && <Alert variant="danger">{error}</Alert>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" fullWidth onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" fullWidth disabled={!canSubmit || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "…" : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
