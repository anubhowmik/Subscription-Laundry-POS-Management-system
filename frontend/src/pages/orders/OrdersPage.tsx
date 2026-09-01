import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Undo2, Clock, RefreshCw, PackageCheck, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { StatCard } from "../../components/ui/StatCard";
import { LoadingState } from "../../components/ui/Spinner";
import { selectClass, inputClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";

type ItemFulfillmentStatus = "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED";

const COLUMNS: ItemFulfillmentStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"];

const STATUS_LABEL: Record<ItemFulfillmentStatus, { en: string; ar: string; dot: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", dot: "bg-slate-400" },
  IN_PROGRESS: { en: "In Progress", ar: "قيد التنفيذ", dot: "bg-amber-500" },
  READY: { en: "Ready", ar: "جاهز", dot: "bg-sky-500" },
  DELIVERED: { en: "Delivered", ar: "تم التسليم", dot: "bg-green-500" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", dot: "bg-red-500" },
};

// The stat row above the board mirrors its 5 columns 1:1 - same status, same color family, so the
// tiles read as a summary of what's below rather than a second, disconnected metric system. READY
// is the one flipped to a solid fill (highlight) since it's the actionable "do something now" column.
const STATUS_STAT: Record<ItemFulfillmentStatus, { icon: typeof Clock; cardBg: string; iconBg: string; highlight?: boolean }> = {
  PENDING: { icon: Clock, cardBg: "bg-slate-100", iconBg: "bg-slate-400" },
  IN_PROGRESS: { icon: RefreshCw, cardBg: "bg-amber-50", iconBg: "bg-amber-500" },
  READY: { icon: PackageCheck, cardBg: "bg-sky-500", iconBg: "bg-white/20", highlight: true },
  DELIVERED: { icon: CheckCircle2, cardBg: "bg-emerald-50", iconBg: "bg-emerald-500" },
  CANCELLED: { icon: XCircle, cardBg: "bg-rose-50", iconBg: "bg-rose-500" },
};

// Advancing a card moves it one step forward in the wash pipeline; not meaningful for DELIVERED/CANCELLED.
const NEXT_STATUS: Partial<Record<ItemFulfillmentStatus, ItemFulfillmentStatus>> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "READY",
  READY: "DELIVERED",
};

// Mirror of NEXT_STATUS, for undoing a mis-click. Deliberately excludes CANCELLED - there's no
// single "previous" status to restore to (it could have been cancelled from any stage), so that
// stays a dead end in this board rather than guessing.
const PREV_STATUS: Partial<Record<ItemFulfillmentStatus, ItemFulfillmentStatus>> = {
  IN_PROGRESS: "PENDING",
  READY: "IN_PROGRESS",
  DELIVERED: "READY",
};

interface BoardItem {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  fulfillmentStatus: ItemFulfillmentStatus;
  statusUpdatedAt: string | null;
  // Only set when fulfillmentStatus is CANCELLED - what it was cancelled FROM, per the audit
  // trail, so restoring puts it back where it actually was instead of resetting to Pending.
  restoreStatus: ItemFulfillmentStatus | null;
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
    mutationFn: async ({ saleId, itemId, status, note }: { saleId: string; itemId: string; status: ItemFulfillmentStatus; note?: string }) =>
      api.patch(`/sales/${saleId}/items/${itemId}/status`, { status, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders-board"] }),
  });

  const grouped = COLUMNS.map((status) => ({
    status,
    items: (items ?? []).filter((item) => item.fulfillmentStatus === status),
  }));

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title={isAr ? "الطلبات" : "Orders"}
        actions={
          <>
            <select
              value={locationScope}
              onChange={(e) => setLocationScope(e.target.value as "current" | "all")}
              className={cn(selectClass, "!w-auto")}
            >
              <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
              <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث برقم الفاتورة أو العميل" : "Search invoice or customer"}
              className={cn(inputClass, "!w-64")}
            />
          </>
        }
      />

      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {grouped.map((col) => (
            <StatCard
              key={col.status}
              icon={STATUS_STAT[col.status].icon}
              cardBg={STATUS_STAT[col.status].cardBg}
              iconBg={STATUS_STAT[col.status].iconBg}
              iconColor="text-white"
              highlight={STATUS_STAT[col.status].highlight}
              label={isAr ? STATUS_LABEL[col.status].ar : STATUS_LABEL[col.status].en}
              value={String(col.items.length)}
            />
          ))}
        </div>
      )}

      {isLoading && <LoadingState label={t("common.loading")} />}

      {!isLoading && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {grouped.map((col) => (
            <div key={col.status} className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                <span className={cn("h-2 w-2 rounded-full", STATUS_LABEL[col.status].dot)} />
                <span className="text-sm font-semibold text-slate-700">{isAr ? STATUS_LABEL[col.status].ar : STATUS_LABEL[col.status].en}</span>
                <Badge variant="neutral" className="ms-auto !bg-white">{col.items.length}</Badge>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {col.items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t("common.noResults")}</p>}
                {col.items.map((item) => {
                  const next = NEXT_STATUS[item.fulfillmentStatus];
                  const prev = PREV_STATUS[item.fulfillmentStatus];
                  return (
                    <Card key={item.id} className="p-2.5">
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
                      {(prev || next) && (
                        <div className="mt-2 flex items-center gap-1.5">
                          {prev && (
                            <button
                              type="button"
                              title={isAr ? `رجوع إلى ${STATUS_LABEL[prev].ar}` : `Back to ${STATUS_LABEL[prev].en}`}
                              onClick={() =>
                                updateStatus.mutate({
                                  saleId: item.sale.id,
                                  itemId: item.id,
                                  status: prev,
                                  note: isAr ? "تراجع عبر لوحة الطلبات" : "Reverted via Orders board",
                                })
                              }
                              disabled={updateStatus.isPending}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                            </button>
                          )}
                          {next && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="!flex-1 !bg-sky-50 !text-sky-700 hover:!bg-sky-100"
                              onClick={() => updateStatus.mutate({ saleId: item.sale.id, itemId: item.id, status: next })}
                              disabled={updateStatus.isPending}
                            >
                              {isAr ? `نقل إلى ${STATUS_LABEL[next].ar}` : `Move to ${STATUS_LABEL[next].en}`}
                            </Button>
                          )}
                        </div>
                      )}
                      {item.fulfillmentStatus !== "CANCELLED" && item.fulfillmentStatus !== "DELIVERED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          fullWidth
                          className="mt-1 !text-red-500 hover:!bg-red-50"
                          onClick={() => updateStatus.mutate({ saleId: item.sale.id, itemId: item.id, status: "CANCELLED" })}
                          disabled={updateStatus.isPending}
                        >
                          {isAr ? "إلغاء" : "Cancel item"}
                        </Button>
                      )}
                      {item.fulfillmentStatus === "CANCELLED" && item.restoreStatus && (
                        <Button
                          variant="outline"
                          size="sm"
                          fullWidth
                          className="mt-2 !text-slate-600"
                          onClick={() =>
                            updateStatus.mutate({
                              saleId: item.sale.id,
                              itemId: item.id,
                              status: item.restoreStatus!,
                              note: isAr ? "استُعيد بعد الإلغاء عبر لوحة الطلبات" : "Restored from cancellation via Orders board",
                            })
                          }
                          disabled={updateStatus.isPending}
                        >
                          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          {isAr ? `استعادة إلى ${STATUS_LABEL[item.restoreStatus].ar}` : `Restore to ${STATUS_LABEL[item.restoreStatus].en}`}
                        </Button>
                      )}
                    </Card>
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
