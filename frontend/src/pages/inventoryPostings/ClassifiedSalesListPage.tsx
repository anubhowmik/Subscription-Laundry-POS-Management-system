import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { TableContainer, TableScroll, Table, THead, Th } from "../../components/ui/Table";

interface ClassifiedSaleRow {
  id: string;
  status: "IN_STOCK" | "OUT_STOCK" | "IN_WAREHOUSE";
  sale: { id: string; invoiceNumber: string | null; saleDate: string; totalAmount: string; customer: { nameEn: string; nameAr: string | null } };
  inventoryPosting: { id: string; postingDate: string; businessLocation: { branchName: string } };
}

const STATUS_LABEL: Record<string, { en: string; ar: string; variant: "success" | "warning" | "neutral" }> = {
  IN_STOCK: { en: "In Stock", ar: "في المتجر", variant: "warning" },
  OUT_STOCK: { en: "Out Stock", ar: "تم التسليم", variant: "neutral" },
  IN_WAREHOUSE: { en: "In Warehouse", ar: "في المستودع", variant: "success" },
};

// Backs both reference's "Inventory" (status=IN_STOCK,IN_WAREHOUSE) and "Warehouse Invoices"
// (status=IN_WAREHOUSE) sidebar items - both are the same classified-sales view, just a different
// status filter, so one component serves both routes (see App.tsx).
export default function ClassifiedSalesListPage({ titleEn, titleAr, statusFilter }: { titleEn: string; titleAr: string; statusFilter: string }) {
  const { i18n, t } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [page, setPage] = useState(1);
  const limit = 25;

  const { data } = useQuery({
    queryKey: ["inventory-postings-classified-sales", statusFilter, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<ClassifiedSaleRow[]>>("/inventory-postings/classified-sales", { params: { status: statusFilter, page, limit } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? titleAr : titleEn} />

      <TableContainer>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "رقم الفاتورة" : "Invoice No"}</Th>
                <Th>{isAr ? "تاريخ البيع" : "Sale Date"}</Th>
                <Th>{isAr ? "العميل" : "Customer"}</Th>
                <Th>{isAr ? "الإجمالي" : "Total"}</Th>
                <Th>{isAr ? "الفرع" : "Location"}</Th>
                <Th>{isAr ? "تاريخ الجرد" : "Posting Date"}</Th>
                <Th>{t("common.status")}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3"><span className="ltr-nums">{r.sale.invoiceNumber}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.sale.saleDate).toLocaleDateString(locale)}</span></td>
                  <td className="px-4 py-3">{isAr ? r.sale.customer.nameAr || r.sale.customer.nameEn : r.sale.customer.nameEn}</td>
                  <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(r.sale.totalAmount, currency, locale)}</span></td>
                  <td className="px-4 py-3">{r.inventoryPosting.businessLocation.branchName}</td>
                  <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.inventoryPosting.postingDate).toLocaleDateString(locale)}</span></td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_LABEL[r.status].variant}>{isAr ? STATUS_LABEL[r.status].ar : STATUS_LABEL[r.status].en}</Badge>
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
