import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";

type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

const COLUMNS: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

const STATUS_LABEL: Record<ItemFulfillmentStatus, { en: string; ar: string; cls: string; dot: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  READY: { en: "Ready", ar: "جاهز", cls: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم", cls: "bg-green-100 text-green-700", dot: "bg-green-500" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

// Advancing a card moves it one step forward in the wash pipeline; not meaningful for DELIVERED/CANCELLED.
const NEXT_STATUS: Partial<Record<ItemFulfillmentStatus, ItemFulfillmentStatus>> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "READY",
  READY: "DELIVERED",
};

interface BoardItem {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  fulfillmentStatus: ItemFulfillmentStatus;
  statusUpdatedAt: string | null;
  sale: {
    id: string;
    invoiceNumber: string;
    saleDate: string;
    customer: { nameEn: string; nameAr: string | null; phone: string } | null;
  };
}

/**
 * Cross-invoice operational board: what's still washing, what's ready for pickup, what's been
 * delivered - built on the per-item fulfillment tracking from the POS side (SaleItem.fulfillmentStatus).
 * A cashier working the counter needs this view; digging through the Sales list one invoice at a
 * time doesn't answer "what's ready right now" quickly.
 */
export default function OrdersPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocationId } = useBusinessLocation();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [locationScope, setLocationScope] = useState<"current" | "all">("current");

  const params = {
    search: search || undefined,
    businessLocationId: locationScope === "current" ? currentLocationId : undefined,
  };

  const { data: items, isLoading } = useQuery({
    queryKey: ["orders-board", params],
    queryFn: async () => (await api.get<ApiSuccess<BoardItem[]>>("/sales/board", { params })).data.data,
    refetchInterval: 30_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ saleId, itemId, status }: { saleId: string; itemId: string; status: ItemFulfillmentStatus }) =>
      api.patch(`/sales/${saleId}/items/${itemId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders-board"] }),
  });

  const grouped = COLUMNS.map((status) => ({
    status,
    items: (items ?? []).filter((item) => item.fulfillmentStatus === status),
  }));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الطلبات" : "Orders"}</h1>
        <div className="flex items-center gap-2">
          <select
            value={locationScope}
            onChange={(e) => setLocationScope(e.target.value as "current" | "all")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
            <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث برقم الفاتورة أو العميل" : "Search invoice or customer"}
            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {isLoading && <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p>}

      {!isLoading && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {grouped.map((col) => (
            <div key={col.status} className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${STATUS_LABEL[col.status].dot}`} />
                <span className="text-sm font-semibold text-slate-700">{isAr ? STATUS_LABEL[col.status].ar : STATUS_LABEL[col.status].en}</span>
                <span className="ms-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">{col.items.length}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {col.items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t("common.noResults")}</p>}
                {col.items.map((item) => {
                  const next = NEXT_STATUS[item.fulfillmentStatus];
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-1">
                        <span className="ltr-nums text-xs font-semibold text-sky-700">{item.sale.invoiceNumber}</span>
                        <span className="ltr-nums text-[10px] text-slate-400">{new Date(item.sale.saleDate).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-slate-800">
                        {isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {item.sale.customer ? (isAr ? item.sale.customer.nameAr || item.sale.customer.nameEn : item.sale.customer.nameEn) : "—"}
                        {" · "}
                        <span className="ltr-nums">{isAr ? "الكمية" : "Qty"} {item.quantity}</span>
                      </p>
                      {next && (
                        <button
                          onClick={() => updateStatus.mutate({ saleId: item.sale.id, itemId: item.id, status: next })}
                          disabled={updateStatus.isPending}
                          className="mt-2 w-full rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                        >
                          {isAr ? `نقل إلى ${STATUS_LABEL[next].ar}` : `Move to ${STATUS_LABEL[next].en}`}
                        </button>
                      )}
                      {item.fulfillmentStatus !== "CANCELLED" && item.fulfillmentStatus !== "DELIVERED" && (
                        <button
                          onClick={() => updateStatus.mutate({ saleId: item.sale.id, itemId: item.id, status: "CANCELLED" })}
                          disabled={updateStatus.isPending}
                          className="mt-1 w-full text-[11px] text-red-500 hover:underline disabled:opacity-50"
                        >
                          {isAr ? "إلغاء" : "Cancel item"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
