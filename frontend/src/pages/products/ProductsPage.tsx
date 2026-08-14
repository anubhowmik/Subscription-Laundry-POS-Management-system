import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ProductFormModal, type EditingProduct } from "../../components/products/ProductFormModal";

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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditingProduct | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["products", search, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Product[]>>("/products", { params: { search, page, limit: 20 } });
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("products.title")}</h1>
        <button
          onClick={openAdd}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {isAr ? "منتج جديد" : "Add Product"}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {formOpen && (
        <ProductFormModal isAr={isAr} editing={editing} onClose={() => setFormOpen(false)} onCreated={() => setFormOpen(false)} />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{t("products.sku")}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{t("products.category")}</th>
              <th className="px-4 py-2 text-start">{t("products.sellingPrice")}</th>
              <th className="px-4 py-2 text-start">{t("products.stock")}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{p.sku}</span></td>
                <td className="px-4 py-2">{isAr ? p.nameAr || p.nameEn : p.nameEn}</td>
                <td className="px-4 py-2">{p.category ? (isAr ? p.category.nameAr : p.category.nameEn) : "-"}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(p.sellingPrice, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{p.manageStock ? p.totalStock : "-"}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(p)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                    {p.status === "ACTIVE" && (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? `حذف "${p.nameEn}"؟` : `Delete "${p.nameEn}"?`)) deleteMutation.mutate(p.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {isAr ? "حذف" : "Delete"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            {t("common.page")} {page} {t("common.of")} {data.meta.totalPages}
          </span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
