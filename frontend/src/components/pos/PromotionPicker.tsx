import { useState } from "react";
import { isAxiosError } from "axios";
import { Gift, X } from "lucide-react";
import { usePosStore } from "../../stores/posStore";
import { PROMOTION_TYPE_LABELS, promotionCartItems, requestPromotion, useActivePromotions } from "../../api/promotionsApi";
import { Button } from "../ui/Button";
import { cn } from "../../lib/cn";
import { inputSmClass } from "../ui/formClasses";

/**
 * Reference POS promotion box (pos_form.blade.php `select_promotion_id` + Apply / Cancel): pick one
 * of the promotions active right now and apply it to the cart, or cancel the applied one. Hidden
 * while a coupon without "Added Discount" is on the cart (the reference disables the button then);
 * with one that adds on, applying a promotion changes the cart, which drops the coupon to re-apply.
 */
export function PromotionPicker({
  isAr,
  businessLocationId,
  mode,
  notify,
  variant,
  pillClass,
}: {
  isAr: boolean;
  businessLocationId: string | undefined;
  mode?: "SERVICE" | "PRODUCT";
  notify: (msg: string) => void;
  variant: "pill" | "inline";
  pillClass?: string;
}) {
  const promotion = usePosStore((s) => s.promotion);
  const coupon = usePosStore((s) => s.coupon);
  const customer = usePosStore((s) => s.customer);
  const hasLines = usePosStore((s) => s.lines.length > 0);
  const { applyPromotion, cancelPromotion } = usePosStore();
  const { data } = useActivePromotions();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const promotions = data?.promotions ?? [];

  async function apply() {
    const state = usePosStore.getState();
    if (!selected || !businessLocationId) return;
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer");
    if (state.lines.length === 0) return notify(isAr ? "لم يتم العثور على منتجات" : "No products found");
    setPending(true);
    try {
      const result = await requestPromotion({
        businessLocationId,
        customerId: state.customer.id,
        items: promotionCartItems(state.promotion?.originalLines ?? state.lines),
        promotionId: selected,
        priceListId: state.priceListId ?? undefined,
        mode,
      });
      if (result.applied) {
        applyPromotion(result);
        notify(isAr ? "تم تطبيق العرض الترويجي بنجاح" : "Promotion applied successfully");
        setOpen(false);
      } else {
        notify(isAr ? "الشروط غير مطابقة" : "Conditions do not match");
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data?.message : undefined;
      notify(msg === "Conditions do not match" || !msg ? (isAr ? "الشروط غير مطابقة" : "Conditions do not match") : msg === "Promotion not active now!" && isAr ? "العرض الترويجي غير مفعل الان!" : msg);
    } finally {
      setPending(false);
    }
  }

  const typeLabel = promotion ? PROMOTION_TYPE_LABELS[promotion.type][isAr ? "ar" : "en"] : "";
  if (promotion) {
    const chip = (
      <span className="inline-flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        <span className="max-w-[12rem] truncate">{promotion.name}</span>
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
    );
    const cancel = () => {
      cancelPromotion();
      notify(isAr ? "تم إلغاء العرض الترويجي" : "Promotion cancelled");
    };
    return variant === "pill" ? (
      <button onClick={cancel} title={`${typeLabel} - ${isAr ? "إلغاء" : "Cancel"}`} className={cn(pillClass, "!bg-emerald-100 !text-emerald-700 hover:!bg-emerald-200")}>
        {chip}
      </button>
    ) : (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
        <Gift className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="font-semibold">{promotion.name}</span>
        <span className="text-xs text-emerald-600">({typeLabel})</span>
        {promotion.cashBack != null && (
          <span className="text-xs">
            {isAr ? "استرداد نقدي" : "Cash back"}: <span className="ltr-nums">{promotion.cashBack.toFixed(2)}</span>
          </span>
        )}
        <Button size="sm" variant="outline" className="ms-auto" onClick={cancel}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    );
  }

  if ((coupon && !coupon.addedDiscount) || promotions.length === 0) return null;
  const picker = (
    <div className="flex gap-1.5">
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className={cn(inputSmClass, "min-w-0 flex-1")} aria-label={isAr ? "العرض الترويجي" : "Promotion"}>
        <option value="">{isAr ? "يرجى الاختيار" : "Please Select"}</option>
        {promotions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={apply} disabled={!selected || pending || !hasLines || !customer}>
        {pending ? "…" : isAr ? "تطبيق" : "Apply"}
      </Button>
    </div>
  );
  if (variant === "inline") {
    return (
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Gift className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> {isAr ? "العرض الترويجي" : "Promotion"}
        </label>
        {picker}
      </div>
    );
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className={pillClass}>
        <Gift className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "العرض الترويجي" : "Promotion"}
      </button>
      {open && <div className="absolute bottom-full start-0 z-20 mb-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{picker}</div>}
    </div>
  );
}
