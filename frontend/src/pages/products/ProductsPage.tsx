import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { ProductFormModal, type EditingProduct } from "../../components/products/ProductFormModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { SearchInput } from "../../components/ui/SearchInput";
import { selectClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { useCategories, useBrands } from "../../api/posApi";
import { Package, Pencil, Power } from "lucide-react";
import type { ReactNode } from "react";

interface TaxOption {
  id: string;
  percentage: string;
}

interface Product {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  brandId: string | null;
  unitId: string;
  taxId: string | null;
  sellingPrice: string;
  sellingPriceTaxType: "INCLUSIVE" | "EXCLUSIVE";
  image: string | null;
  totalStock: number;
  manageStock: boolean;
  category: { nameEn: string; nameAr: string } | null;
  brand: { nameEn: string; nameAr: string } | null;
  tax: { percentage: string } | null;
  status: "ACTIVE" | "INACTIVE";
}

export default function ProductsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingProduct | null>(null);
  const qc = useQueryClient();

  // Sortable column headers matching the reference's DataTable - backend already whitelists
  // these fields (product.service.ts's SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("nameEn");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  const columns: { key: string; label: string; sortField?: string; render: (p: Product) => ReactNode; exportValue: (p: Product) => string | number | null }[] = [
    { key: "sku", label: t("products.sku"), sortField: "sku", render: (p) => <span className="ltr-nums">{p.sku}</span>, exportValue: (p) => p.sku },
    {
      key: "name",
      label: t("common.name"),
      sortField: "nameEn",
      render: (p) => (isAr ? p.nameAr || p.nameEn : p.nameEn),
      exportValue: (p) => (isAr ? p.nameAr || p.nameEn : p.nameEn),
    },
    {
      key: "category",
      label: t("products.category"),
      render: (p) => (p.category ? (isAr ? p.category.nameAr : p.category.nameEn) : "-"),
      exportValue: (p) => (p.category ? (isAr ? p.category.nameAr : p.category.nameEn) : null),
    },
    {
      key: "brand",
      label: isAr ? "العلامة التجارية" : "Brand",
      render: (p) => (p.brand ? (isAr ? p.brand.nameAr : p.brand.nameEn) : "-"),
      exportValue: (p) => (p.brand ? (isAr ? p.brand.nameAr : p.brand.nameEn) : null),
    },
    {
      key: "sellingPrice",
      label: t("products.sellingPrice"),
      sortField: "sellingPrice",
      render: (p) => <span className="ltr-nums">{formatMoney(p.sellingPrice, currency, locale)}</span>,
      exportValue: (p) => Number(p.sellingPrice),
    },
    {
      key: "stock",
      label: t("products.stock"),
      render: (p) => <span className="ltr-nums">{p.manageStock ? p.totalStock : "-"}</span>,
      exportValue: (p) => (p.manageStock ? p.totalStock : null),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (p) => <Badge variant={p.status === "ACTIVE" ? "success" : "neutral"}>{p.status === "ACTIVE" ? t("common.active") : t("common.inactive")}</Badge>,
      exportValue: (p) => (p.status === "ACTIVE" ? t("common.active") : t("common.inactive")),
    },
  ];

  const columnVisibility = useColumnVisibility(
    "products",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "INACTIVE">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [taxFilter, setTaxFilter] = useState("");
  const activeFilterCount = (statusFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (brandFilter ? 1 : 0) + (taxFilter ? 1 : 0);
  function clearAllFilters() {
    setStatusFilter("");
    setCategoryFilter("");
    setBrandFilter("");
    setTaxFilter("");
    setPage(1);
  }

  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const { data: taxes } = useQuery({
    queryKey: ["taxes-all"],
    queryFn: async () => (await api.get<ApiSuccess<TaxOption[]>>("/taxes")).data.data,
  });

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    search,
    sortBy,
    sortOrder,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(brandFilter ? { brandId: brandFilter } : {}),
    ...(taxFilter ? { taxId: taxFilter } : {}),
  };

  const { data } = useQuery({
    queryKey: ["products", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Product[]>>("/products", { params: { ...filterParams, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pos", "products"] });
    },
  });

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(p: Product) {
    setEditing({
      id: p.id,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      sku: p.sku,
      unitId: p.unitId,
      categoryId: p.categoryId,
      taxId: p.taxId,
      sellingPrice: p.sellingPrice,
      sellingPriceTaxType: p.sellingPriceTaxType,
      manageStock: p.manageStock,
      image: p.image,
    });
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("products.title")}
        actions={<Button onClick={openAdd}>+ {isAr ? "منتج جديد" : "Add Product"}</Button>}
      />

      {formOpen && (
        <ProductFormModal isAr={isAr} editing={editing} onClose={() => setFormOpen(false)} onCreated={() => setFormOpen(false)} />
      )}

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Package}
            cardBg="bg-app-pos-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={t("products.title")}
            value={String(data.meta.total)}
          />
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
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.status")}</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="ACTIVE">{t("common.active")}</option>
                <option value="INACTIVE">{t("common.inactive")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("products.category")}</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "العلامة التجارية" : "Brand"}</label>
              <select
                value={brandFilter}
                onChange={(e) => {
                  setBrandFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {brands?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {isAr ? b.nameAr || b.nameEn : b.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الضريبة" : "Tax"}</label>
              <select
                value={taxFilter}
                onChange={(e) => {
                  setTaxFilter(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {taxes?.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {tx.percentage}%
                  </option>
                ))}
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
              title={t("products.title")}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<Product>(async (p, l) => {
                  const res = await api.get<ApiSuccess<Product[]>>("/products", { params: { ...filterParams, page: p, limit: l } });
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
              <Th className="text-end">{t("common.actions")}</Th>
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
                <td className="px-4 py-3 text-end">
                  <RowActions>
                    <RowActionButton icon={Pencil} label={isAr ? "تعديل" : "Edit"} onClick={() => openEdit(p)} />
                    {p.status === "ACTIVE" && (
                      <RowActionButton
                        icon={Power}
                        label={isAr ? "تعطيل" : "Deactivate"}
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${p.nameEn}"؟` : `Deactivate "${p.nameEn}"?`, danger: true })) deleteMutation.mutate(p.id);
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
