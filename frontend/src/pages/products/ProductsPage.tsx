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
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { Package } from "lucide-react";

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
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("products.sku")}</Th>
              <Th>{t("common.name")}</Th>
              <Th className="hidden md:table-cell">{t("products.category")}</Th>
              <Th>{t("products.sellingPrice")}</Th>
              <Th className="hidden sm:table-cell">{t("products.stock")}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{p.sku}</span></td>
                <td className="px-4 py-3">{isAr ? p.nameAr || p.nameEn : p.nameEn}</td>
                <td className="hidden px-4 py-3 md:table-cell">{p.category ? (isAr ? p.category.nameAr : p.category.nameEn) : "-"}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(p.sellingPrice, currency, locale)}</span></td>
                <td className="hidden px-4 py-3 sm:table-cell"><span className="ltr-nums">{p.manageStock ? p.totalStock : "-"}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === "ACTIVE" ? "success" : "neutral"}>
                    {p.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      {isAr ? "تعديل" : "Edit"}
                    </Button>
                    {p.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${p.nameEn}"؟` : `Deactivate "${p.nameEn}"?`, danger: true })) deleteMutation.mutate(p.id);
                        }}
                      >
                        {isAr ? "تعطيل" : "Deactivate"}
                      </Button>
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
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && (
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
