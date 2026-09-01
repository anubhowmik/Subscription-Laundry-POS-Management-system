import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { Modal } from "../ui/Modal";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { LoadingState } from "../ui/Spinner";
import { cn } from "../../lib/cn";

export type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

const STATUS_ORDER: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

type BadgeVariant = "neutral" | "warning" | "info" | "success" | "danger";

const STATUS_LABEL: Record<ItemFulfillmentStatus, { en: string; ar: string; variant: BadgeVariant }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", variant: "neutral" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ", variant: "warning" },
  READY: { en: "Ready", ar: "جاهز", variant: "info" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم", variant: "success" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", variant: "danger" },
};

// Same color tokens as Badge's variants, applied directly to the interactive status-picker
// buttons below (Badge itself is a non-interactive span, so the picker uses raw classes).
const VARIANT_BUTTON_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
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
    <Modal
      title={sale?.invoiceNumber ?? "…"}
      subtitle={sale ? (isAr ? sale.customer.nameAr || sale.customer.nameEn : sale.customer.nameEn) : undefined}
      onClose={onClose}
      size="lg"
    >
      {isLoading && <LoadingState label={isAr ? "جارٍ التحميل" : "Loading"} />}

      {sale && (
        <div className="space-y-2">
          {sale.items.map((item) => (
            <Card key={item.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}</p>
                  <p className="ltr-nums text-xs text-slate-400">
                    {item.quantity} × {formatMoney(item.unitPrice, currency, locale)} = {formatMoney(item.total, currency, locale)}
                  </p>
                </div>
                <Badge variant={STATUS_LABEL[item.fulfillmentStatus].variant} className="shrink-0">
                  {isAr ? STATUS_LABEL[item.fulfillmentStatus].ar : STATUS_LABEL[item.fulfillmentStatus].en}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus.mutate({ itemId: item.id, status: s })}
                    disabled={updateStatus.isPending || item.fulfillmentStatus === s}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-default",
                      item.fulfillmentStatus === s ? VARIANT_BUTTON_CLASS[STATUS_LABEL[s].variant] : "bg-slate-50 text-slate-500 hover:bg-slate-100",
                    )}
                  >
                    {isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}
