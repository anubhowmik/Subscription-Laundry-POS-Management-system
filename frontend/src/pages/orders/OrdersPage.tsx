import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Undo2, Clock, RefreshCw, PackageCheck, CheckCircle2, XCircle, X, RotateCcw } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useServices, useServiceCategories } from "../../api/posApi";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { StatCard } from "../../components/ui/StatCard";
import { LoadingState } from "../../components/ui/Spinner";
import { Alert } from "../../components/ui/Alert";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";
import { selectClass, inputClass } from "../../components/ui/formClasses";
import { FiltersMenu } from "../../components/ui/TableToolbarControls";
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

// Reference's own color-coded order card (small-box) - here the color signals the item's own
// fulfillment stage (a meaningful signal in our schema) rather than reference's corporate/
// quotation/table distinction (concepts this app doesn't have), as a left accent bar rather than
// a fully-colored background so it still sits inside this app's plain white-card system.
const STATUS_ACCENT: Record<ItemFulfillmentStatus, string> = {
  PENDING: "border-s-slate-400",
  IN_PROGRESS: "border-s-amber-500",
  READY: "border-s-sky-500",
  DELIVERED: "border-s-emerald-500",
  CANCELLED: "border-s-rose-500",
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
  // Reference's own returned-quantity icon on each order card (Restaurant\OrderController's
  // `returned` filter/badge) - true when at least one sell return line references this item.
  hasReturn: boolean;
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
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [locationScope, setLocationScope] = useState<"current" | "all">("current");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [returnedOnly, setReturnedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);

  const activeFilterCount =
    (locationScope === "all" ? 1 : 0) +
    (serviceCategoryId ? 1 : 0) +
    (serviceId ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (returnedOnly ? 1 : 0);
  function clearAllFilters() {
    setLocationScope("current");
    setServiceCategoryId("");
    setServiceId("");
    setFromDate("");
    setToDate("");
    setReturnedOnly(false);
  }

  const { data: serviceCategories } = useServiceCategories();
  const { data: services } = useServices({ businessLocationId: currentLocationId ?? undefined, categoryId: serviceCategoryId || undefined });

  const params = {
    search: search || undefined,
    businessLocationId: locationScope === "current" ? currentLocationId : undefined,
    serviceCategoryId: serviceCategoryId || undefined,
    serviceId: serviceId || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    returned: returnedOnly ? "true" : undefined,
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

  // Reference's own bulk "Mark as Cleaned"/"Mark as Ready" - a laundry counter processing a rack
  // of garments at once shouldn't have to click through each card individually.
  const bulkUpdateStatus = useMutation({
    mutationFn: async (status: ItemFulfillmentStatus) => api.patch("/sales/items/bulk-status", { itemIds: [...selected], status }),
    onSuccess: () => {
      setSelected(new Set());
      setBulkError(null);
      qc.invalidateQueries({ queryKey: ["orders-board"] });
    },
    onError: (err) => {
      const msg =
        isAxiosError(err) && err.response?.data?.message ? err.response.data.message : isAr ? "تعذّر تحديث العناصر المحددة" : "Could not update the selected items";
      setBulkError(msg);
    },
  });

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث برقم الفاتورة أو العميل" : "Search invoice or customer"}
              className={cn(inputClass, "!w-64")}
            />
            <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
                <select
                  value={locationScope}
                  onChange={(e) => setLocationScope(e.target.value as "current" | "all")}
                  className={cn(selectClass, "w-full")}
                >
                  <option value="current">{isAr ? "هذا الفرع" : "This branch"}</option>
                  <option value="all">{isAr ? "كل الفروع" : "All branches"}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "فئة الخدمة" : "Service Category"}</label>
                <select
                  value={serviceCategoryId}
                  onChange={(e) => {
                    setServiceCategoryId(e.target.value);
                    setServiceId("");
                  }}
                  className={cn(selectClass, "w-full")}
                >
                  <option value="">{isAr ? "كل الفئات" : "All categories"}</option>
                  {(serviceCategories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {isAr ? c.nameAr || c.nameEn : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الخدمة" : "Service"}</label>
                <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={cn(selectClass, "w-full")}>
                  <option value="">{isAr ? "كل الخدمات" : "All services"}</option>
                  {(services ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {isAr ? s.nameAr || s.nameEn : s.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={returnedOnly}
                  onChange={(e) => setReturnedOnly(e.target.checked)}
                />
                {isAr ? "له مرتجع فقط" : "Returned only"}
              </label>
            </FiltersMenu>
          </>
        }
      />

      {bulkError && <Alert variant="danger">{bulkError}</Alert>}

      {/* Reference's own bulk "Mark as Cleaned"/"Mark as Ready" toolbar - appears once at least one
          card is selected, letting a laundry counter move a whole batch of garments in one action
          instead of clicking through each card's own next/prev buttons. */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <span className="ltr-nums text-sm font-medium text-sky-700">
            {isAr ? `${selected.size} محدد` : `${selected.size} selected`}
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-1.5">
            {(["IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"] as ItemFulfillmentStatus[]).map((status) => (
              <Button
                key={status}
                variant="secondary"
                size="sm"
                disabled={bulkUpdateStatus.isPending}
                onClick={() => bulkUpdateStatus.mutate(status)}
              >
                {isAr ? `نقل إلى ${STATUS_LABEL[status].ar}` : `Move to ${STATUS_LABEL[status].en}`}
              </Button>
            ))}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white"
              title={isAr ? "إلغاء التحديد" : "Clear selection"}
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      )}

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
                {col.items.length > 0 && (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                    title={isAr ? "تحديد الكل في هذا العمود" : "Select all in this column"}
                    checked={col.items.every((item) => selected.has(item.id))}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        col.items.forEach((item) => (e.target.checked ? next.add(item.id) : next.delete(item.id)));
                        return next;
                      })
                    }
                  />
                )}
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
                    <Card
                      key={item.id}
                      className={cn(
                        "border-s-4 p-2.5",
                        STATUS_ACCENT[item.fulfillmentStatus],
                        selected.has(item.id) && "!border-s-sky-400 !bg-sky-50/60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <label className="flex min-w-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                          {/* Reference's own "Order Details" modal action - the invoice number
                              itself is the trigger, matching the same clickable-invoice pattern
                              already used on the Sell Returns list. */}
                          <button
                            type="button"
                            onClick={() => setViewingSaleId(item.sale.id)}
                            className="ltr-nums truncate text-xs font-semibold text-sky-700 hover:underline"
                          >
                            {item.sale.invoiceNumber}
                          </button>
                          {item.hasReturn && (
                            <span title={isAr ? "يوجد مرتجع على هذه الفاتورة" : "This invoice has a return"}>
                              <Undo2 className="h-3 w-3 shrink-0 text-rose-500" strokeWidth={2} aria-hidden />
                            </span>
                          )}
                        </label>
                        <span className="ltr-nums shrink-0 text-[10px] text-slate-400">{new Date(item.sale.saleDate).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</span>
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
                      {item.fulfillmentStatus !== "CANCELLED" && (
                        <div className="mt-1 flex items-center gap-1.5">
                          {/* Reference's own per-order "Sell Return" shortcut - jumps straight to
                              the return flow instead of making the cashier find this invoice
                              again from the Sales list. */}
                          <button
                            type="button"
                            title={isAr ? "مرتجع بيع" : "Sell Return"}
                            onClick={() => navigate("/sell-returns")}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100"
                          >
                            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </button>
                          {item.fulfillmentStatus !== "DELIVERED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              fullWidth
                              className="!text-red-500 hover:!bg-red-50"
                              onClick={() => updateStatus.mutate({ saleId: item.sale.id, itemId: item.id, status: "CANCELLED" })}
                              disabled={updateStatus.isPending}
                            >
                              {isAr ? "إلغاء" : "Cancel item"}
                            </Button>
                          )}
                        </div>
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

      {viewingSaleId && <SaleDetailModal saleId={viewingSaleId} onClose={() => setViewingSaleId(null)} />}
    </div>
  );
}
