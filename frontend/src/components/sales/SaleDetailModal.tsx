import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";

export type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

const STATUS_ORDER: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

const STATUS_LABEL: Record<ItemFulfillmentStatus, { en: string; ar: string; cls: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", cls: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ", cls: "bg-amber-100 text-amber-700" },
  READY: { en: "Ready", ar: "جاهز", cls: "bg-sky-100 text-sky-700" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم", cls: "bg-green-100 text-green-700" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", cls: "bg-red-100 text-red-700" },
};

interface SaleItemDetail {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  unitPrice: string;
  total: string;
  fulfillmentStatus: ItemFulfillmentStatus;
}

interface SaleDetail {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  items: SaleItemDetail[];
  customer: { nameEn: string; nameAr: string | null };
}

interface Props {
  saleId: string;
  onClose: () => void;
}

/** Shows a sale's line items with a per-item fulfillment-status control - the garment tracking view. */
export function SaleDetailModal({ saleId, onClose }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const { data: sale, isLoading } = useQuery({
    queryKey: ["sale-detail", saleId],
    queryFn: async () => (await api.get<ApiSuccess<SaleDetail>>(`/sales/${saleId}`)).data.data,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: ItemFulfillmentStatus }) =>
      api.patch(`/sales/${saleId}/items/${itemId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sale-detail", saleId] }),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{sale?.invoiceNumber ?? "…"}</h3>
            {sale && <p className="text-xs text-slate-400">{isAr ? sale.customer.nameAr || sale.customer.nameEn : sale.customer.nameEn}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {isLoading && <p className="py-8 text-center text-sm text-slate-400">{isAr ? "جارٍ التحميل" : "Loading"}</p>}

        {sale && (
          <div className="space-y-2">
            {sale.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}</p>
                    <p className="ltr-nums text-xs text-slate-400">
                      {item.quantity} × {formatMoney(item.unitPrice, currency, locale)} = {formatMoney(item.total, currency, locale)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[item.fulfillmentStatus].cls}`}>
                    {isAr ? STATUS_LABEL[item.fulfillmentStatus].ar : STATUS_LABEL[item.fulfillmentStatus].en}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus.mutate({ itemId: item.id, status: s })}
                      disabled={updateStatus.isPending || item.fulfillmentStatus === s}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-default ${
                        item.fulfillmentStatus === s ? `${STATUS_LABEL[s].cls} ring-1 ring-inset ring-current` : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
