import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { FileText, CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, Customer } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ProductGrid } from "../../components/pos/ProductGrid";
import { SaleLineTable } from "../../components/pos/SaleLineTable";
import { InvoicePanel } from "../../components/pos/InvoicePanel";
import { AddSaleCustomerSection } from "../../components/pos/AddSaleCustomerSection";
import { AddSaleTotalsSection } from "../../components/pos/AddSaleTotalsSection";
import { AddSalePaymentSection, type AddSalePaymentRow } from "../../components/pos/AddSalePaymentSection";
import { RegisterSessionBar } from "../../components/pos/RegisterSessionBar";
import { PosHeaderBar } from "../../components/pos/PosHeaderBar";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { usePosStore, selectTotals, type PosLine } from "../../stores/posStore";
import {
  usePaymentMethods,
  useCheckout,
  useCreateQuote,
  useCreateDelivery,
  useUpdateQuote,
  useHoldSale,
  useHeldSales,
  useResumeHeldSale,
  useDiscardHeldSale,
  usePriceLists,
  useUploadSaleDocument,
  type SaleResult,
  type PriceListRow,
} from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { promotionCartItems, requestPromotion, type PromotionType } from "../../api/promotionsApi";
import { matchDiscounts } from "../../api/discountsApi";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { selectClass, inputClass, labelClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { MapPin, Banknote, Calendar, Paperclip, X, CirclePause, Clock, Receipt, Trash2, Printer, PackageCheck } from "lucide-react";
import type { BusinessLocation } from "../../types/api";

interface PosPageProps {
  /** Fixes this page to a single POS mode (from /pos/service or /pos/product). Undefined on the
   * legacy combined /pos route, which keeps today's exact behavior (both catalogs, mixed carts
   * allowed), AND on the shared /sales/create ("Add Sale") route - which doesn't pass this prop at
   * all since it's one route reused by all 3 apps. For that route, the effective mode below falls
   * back to deriving it from the current app instead, so Add Sale opened from inside Service POS
   * or Product POS is correctly restricted to just that catalog - otherwise it silently showed
   * both tabs and fired an unconditional `GET /products` (or /services) that 403s for a
   * genuinely-scoped Service-POS-only (or Product-POS-only) role, the exact class of bug
   * documented in [[project_pos_service_product_split]]'s Phase 6 (Supplier field/Price List item
   * picker), just missed for this one screen. Threaded into checkout/quote/hold-sale calls and
   * ProductGrid's fixed tab. */
  mode?: "SERVICE" | "PRODUCT";
  /** "table" swaps the touch-optimized ProductGrid for SaleLineTable and shows a page-level
   * Business Location select (the reference's own "Add Sale" - `sell/create.blade.php` - is a
   * second, back-office-style frontend workflow onto the exact same checkout backend as the POS
   * grid, not a separate feature; see SaleLineTable's own comment). Defaults to "grid", the
   * existing /pos, /pos/service, /pos/product behavior, completely unchanged. */
  layout?: "grid" | "table";
}

// Module-level (not component state) so it survives PosPage unmounting/remounting as you
// navigate between routes, but resets naturally on a full page reload. Used only to detect an
// actual MODE SWITCH (e.g. POS Laundry's own "Service POS"/"Product POS" quick links, which jump
// straight from one to the other without passing through Home) - deliberately not cleared just
// because PosPage happened to unmount, since leaving the POS screen for something else (checking
// a customer, glancing at Sales) and coming back with the cart intact is normal, expected
// behavior. Caught live: switching modes via those quick links left a service item sitting in
// the cart while on the Product POS screen, which would have failed checkout with a confusing
// "item does not belong in Product POS" error instead of just starting the new mode with a clean cart.
let lastPosMode: "SERVICE" | "PRODUCT" | "UNMODED" | undefined;

export default function PosPage({ mode: modeProp, layout = "grid" }: PosPageProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { currentLocation, currentLocationId, locations } = useBusinessLocation();
  const locale = isAr ? "ar-SA" : "en-US";
  const currentApp = useCurrentApp();
  const mode: "SERVICE" | "PRODUCT" | undefined =
    modeProp ?? (currentApp?.key === "posService" ? "SERVICE" : currentApp?.key === "posProduct" ? "PRODUCT" : undefined);

  // The reference's own "Add Sale" form carries its own `select_location_id` field, independent
  // of whatever branch the topbar switcher is on - a back-office user might key in a sale for a
  // DIFFERENT branch than the one they're currently viewing everything else in. Only meaningful
  // (and only shown) for the table layout, and only when there's more than one location to pick
  // from, same "no point showing a single-option selector" convention used elsewhere in this app.
  const [locationOverride, setLocationOverride] = useState<string | null>(null);
  const effectiveLocationId = layout === "table" ? (locationOverride ?? currentLocationId) : currentLocationId;
  const effectiveLocation = layout === "table" ? (locations.find((l) => l.id === effectiveLocationId) ?? currentLocation) : currentLocation;
  const currency = effectiveLocation?.currency ?? "SAR";

  const searchRef = useRef<HTMLInputElement>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  // null = a real FINAL sale (or nothing saved yet); "quote"/"delivery" = which DRAFT sub-type
  // completedSale is (see Sale.isQuotation's schema comment) - drives which success screen shows.
  const [draftKind, setDraftKind] = useState<"quote" | "delivery" | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // Add Sale's own inline payment rows (see AddSalePaymentSection) - kept as page-local state
  // rather than posStore.payments, since the touch-grid POS's PaymentModal still owns that store
  // slice with its own auto-fill/BNPL/cashback logic that doesn't apply to a plain form row.
  const [paymentRows, setPaymentRows] = useState<AddSalePaymentRow[]>([]);
  // QuotesPage.tsx's "Edit" row action lands here as ?editQuoteId=<id> - loaded once below, then
  // every Save action targets useUpdateQuote() against this same row instead of creating a new
  // one (reference's own edit->update() behavior, see backend checkout()'s existingDraftId).
  const [searchParams] = useSearchParams();
  const editQuoteId = searchParams.get("editQuoteId");
  const [editingDraft, setEditingDraft] = useState<{ id: string; kind: "quote" | "delivery" } | null>(null);

  const store = usePosStore();
  const { data: paymentMethods } = usePaymentMethods();
  const { data: priceLists } = usePriceLists();
  const checkout = useCheckout();
  const createQuote = useCreateQuote();
  const createDelivery = useCreateDelivery();
  const updateQuote = useUpdateQuote();
  const holdSale = useHoldSale();

  function notify(msg: string) {
    setBanner(msg);
    window.clearTimeout((notify as unknown as { _t?: number })._t);
    (notify as unknown as { _t?: number })._t = window.setTimeout(() => setBanner(null), 3000);
  }

  // Clear the cart only when actually switching between incompatible modes (see lastPosMode
  // above) - not on every mount, so a cart survives incidental navigation away and back within
  // the same mode.
  useEffect(() => {
    const current = mode ?? "UNMODED";
    if (lastPosMode !== undefined && lastPosMode !== current) {
      store.clear();
    }
    lastPosMode = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to Walk-in Customer so the cashier can start immediately. Skipped entirely while
  // loading an existing draft for editing (below) - that effect sets the draft's own real
  // customer, and this one running first/after would otherwise stomp on it.
  useEffect(() => {
    if (editQuoteId) return;
    if (usePosStore.getState().customer) return;
    api
      .get<ApiSuccess<Customer[]>>("/customers", { params: { search: "WALKIN", limit: 1 } })
      .then((res) => {
        const c = res.data.data[0];
        if (c)
          store.setCustomer({
            id: c.id,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            phone: c.phone,
            balance: c.balance,
            rewardPoints: c.rewardPoints,
            address: c.address,
            addressLine2: c.addressLine2,
            city: c.city,
            state: c.state,
            country: c.country,
            shippingAddress: c.shippingAddress,
            paymentTermsDays: c.paymentTermsDays,
            payTermType: c.payTermType,
          });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads an existing draft (Quote or Delivery) back into the cart for editing - reference's own
  // "Edit" action reopens this exact create-sale screen, pre-filled and resubmittable. Maps the
  // persisted SaleItem rows into PosLine the same way useResumeHeldSale's caller already does for
  // a HeldSale (AddSaleUtilityBar.resume() below) - the backend only ever re-prices lines fresh
  // from productId/serviceId + quantity at submit time (see pos.service.ts's priceLine()), so the
  // unitPrice/taxPercent/unit shown here are just for display until the next save recomputes them.
  useEffect(() => {
    if (!editQuoteId) return;
    interface EditableSaleItem {
      productId: string | null;
      serviceId: string | null;
      descriptionEn: string;
      descriptionAr: string | null;
      quantity: string;
      unitPrice: string;
      taxPercent: string;
      discountAmount: string;
      note: string | null;
      widthM: string | null;
      heightM: string | null;
      promotionId: string | null;
      couponId?: string | null;
      discountId: string | null;
    }
    interface EditableSale {
      isQuotation: boolean;
      promotion: { id: string; name: string; type: PromotionType } | null;
      items: EditableSaleItem[];
      customer: {
        id: string;
        nameEn: string;
        nameAr: string | null;
        phone: string;
        balance: string;
        rewardPoints: number;
        address: string | null;
        addressLine2: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        shippingAddress: string | null;
        paymentTermsDays: number;
        payTermType: "DAYS" | "MONTHS" | null;
      };
    }
    api
      .get<ApiSuccess<EditableSale>>(`/sales/${editQuoteId}`)
      .then((res) => {
        const sale = res.data.data;
        // A saved draft holds the promotion's split rows; the cart goes back to the rows the
        // cashier entered - promoted parts lose the promotion discount and merge back into their
        // item, a Bonus row (added by the promotion on top of the cart) is dropped - so the next
        // save re-runs the promotion from scratch instead of discounting twice.
        const byKey = new Map<string, PosLine>();
        for (const item of sale.items) {
          if (item.promotionId && sale.promotion?.type === "BOUNCE") continue;
          const key = `${item.productId ? "PRODUCT" : "SERVICE"}:${item.productId ?? item.serviceId}`;
          const widthM = item.widthM ? Number(item.widthM) : undefined;
          const heightM = item.heightM ? Number(item.heightM) : undefined;
          // SaleItem.quantity is the billed quantity (pieces x width x height for a sized item).
          const pieces = widthM && heightM ? Math.round((Number(item.quantity) / (widthM * heightM)) * 1000) / 1000 : Number(item.quantity);
          // A coupon's share is inside the line discount too and isn't stored apart, so a coupon line
          // also starts clean: the cashier applies the coupon again (any branch discount re-matches).
          const discount = item.promotionId || item.couponId ? 0 : Number(item.discountAmount);
          const existing = byKey.get(key);
          if (existing) {
            existing.quantity += pieces;
            existing.discountAmount += discount;
            continue;
          }
          byKey.set(key, {
            key,
            type: item.productId ? "PRODUCT" : "SERVICE",
            id: (item.productId ?? item.serviceId)!,
            nameEn: item.descriptionEn,
            nameAr: item.descriptionAr ?? item.descriptionEn,
            unitPrice: Number(item.unitPrice),
            taxPercent: Number(item.taxPercent),
            taxType: "EXCLUSIVE",
            quantity: pieces,
            discountAmount: discount,
            manageStock: false,
            unit: "",
            note: item.note ?? undefined,
            widthM,
            heightM,
            manualDiscount: discount > 0 && !item.discountId ? true : undefined,
          });
        }
        const lines: PosLine[] = [...byKey.values()];
        store.loadCart(lines, {
          id: sale.customer.id,
          nameEn: sale.customer.nameEn,
          nameAr: sale.customer.nameAr,
          phone: sale.customer.phone,
          balance: sale.customer.balance,
          rewardPoints: sale.customer.rewardPoints,
          address: sale.customer.address,
          addressLine2: sale.customer.addressLine2,
          city: sale.customer.city,
          state: sale.customer.state,
          country: sale.customer.country,
          shippingAddress: sale.customer.shippingAddress,
          paymentTermsDays: sale.customer.paymentTermsDays,
          payTermType: sale.customer.payTermType,
        });
        setEditingDraft({ id: editQuoteId, kind: sale.isQuotation ? "quote" : "delivery" });
      })
      .catch(() => notify(isAr ? "تعذّر تحميل المسودة للتعديل" : "Could not load the draft for editing"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editQuoteId]);

  // Promotions > Discounts (reference getProductRow -> getProductDiscount): every item in the cart
  // gets its branch discount pre-filled as the line discount; re-matched when the items, customer,
  // selling price group or branch change.
  const cartItemKeys = usePosStore((s) => [...new Set((s.promotion?.originalLines ?? s.lines).map((l) => `${l.type === "PRODUCT" ? "p" : "s"}:${l.id}`))].sort().join(","));
  const cartCustomerId = usePosStore((s) => s.customer?.id);
  const cartPriceListId = usePosStore((s) => s.priceListId);
  // A coupon without "Added Discount" replaced the line discounts - re-match only once it's removed.
  const discountsReplaced = usePosStore((s) => Boolean(s.coupon && !s.coupon.addedDiscount));
  useEffect(() => {
    if (!effectiveLocationId || !cartCustomerId || !cartItemKeys || discountsReplaced) return;
    let cancelled = false;
    matchDiscounts({ businessLocationId: effectiveLocationId, customerId: cartCustomerId, priceListId: cartPriceListId ?? undefined, itemKeys: cartItemKeys.split(",") })
      .then((matches) => {
        if (!cancelled) store.applyDiscounts(matches);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItemKeys, cartCustomerId, cartPriceListId, effectiveLocationId, discountsReplaced]);

  /**
   * Reference pos.js: Finalize / Card / Draft / Quotation first click `#apply_promotion` with no
   * promotion picked when none is applied yet - the auto-apply promotions get their chance. Done
   * here before the payment step so the totals the cashier charges are the ones checkout computes
   * (checkout runs the same auto-apply server-side). Returns true when a promotion was just applied.
   */
  async function ensurePromotion() {
    const state = usePosStore.getState();
    if (state.promotion || state.coupon || !state.customer || state.lines.length === 0 || !effectiveLocationId) return false;
    try {
      const result = await requestPromotion({
        businessLocationId: effectiveLocationId,
        customerId: state.customer.id,
        items: promotionCartItems(state.lines),
        priceListId: state.priceListId ?? undefined,
        mode,
      });
      if (!result.applied) return false;
      store.applyPromotion(result);
      notify(isAr ? `تم تطبيق العرض الترويجي: ${result.promotion.name}` : `Promotion applied: ${result.promotion.name}`);
      return true;
    } catch {
      // Not fatal - checkout re-runs the same promotion check on its own.
      return false;
    }
  }

  function openPayment(open: boolean) {
    if (!open) return setPaymentOpen(false);
    void ensurePromotion().finally(() => setPaymentOpen(true));
  }

  async function saveDraftWithPromotion(kind: "quote" | "delivery") {
    await ensurePromotion();
    saveAsDraft(kind);
  }

  async function completeSale(print = false) {
    // Add Sale's payment rows are typed before Save - if a promotion only kicks in now, stop so
    // the cashier can see the new total and adjust the payment before saving again.
    if (layout === "table" && (await ensurePromotion())) {
      return notify(isAr ? "تم تطبيق عرض ترويجي - راجع الإجمالي ثم احفظ مرة أخرى" : "A promotion was applied - check the new total, then Save again");
    }
    const state = usePosStore.getState();
    if (state.lines.length === 0) return notify(isAr ? "السلة فارغة" : "Cart is empty");
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer");

    const over = state.lines.find((l) => l.manageStock && l.stockOnHand !== undefined && l.quantity > l.stockOnHand);
    if (over) return notify(isAr ? `الكمية تتجاوز المخزون: ${over.nameEn}` : `Quantity exceeds stock: ${over.nameEn}`);

    // The touch-grid POS has no explicit "sell on credit" confirmation (unlike Add Sale's table
    // layout, which is the deliberate historical/credit-entry path) - so if the cashier opens a
    // tender flow (e.g. Pay Later/BNPL) and backs out without it actually adding a payment row,
    // Complete Sale must not silently finalize a fully-unpaid sale. Require at least one payment
    // row whenever there's anything to pay; partial payments (leaving a real due balance) still work.
    if (layout !== "table" && selectTotals(state).grandTotal > 0 && state.payments.length === 0) {
      return notify(isAr ? "أضف طريقة دفع قبل إتمام البيع" : "Add a payment method before completing the sale");
    }

    // Add Sale's inline payment rows (see AddSalePaymentSection) replace the touch-grid POS's
    // PaymentModal-built `state.payments` for the table layout only - the grid layout keeps its
    // exact prior payload shape untouched.
    const payments =
      layout === "table"
        ? paymentRows.filter((r) => r.amount > 0 && r.paymentMethodId).map((r) => ({ paymentMethodId: r.paymentMethodId, amount: r.amount }))
        : state.payments.map((p) => ({ paymentMethodId: p.paymentMethodId, amount: p.amount, referenceNumber: p.referenceNumber, notes: p.note }));

    checkout.mutate(
      {
        businessLocationId: effectiveLocationId!,
        customerId: state.customer.id,
        items: (state.promotion?.originalLines ?? state.lines).map((l) => ({
          ...(l.type === "PRODUCT" ? { productId: l.id } : { serviceId: l.id }),
          quantity: l.quantity,
          discountAmount: l.discountAmount,
          unitPriceOverride: l.unitPriceOverride,
          taxId: l.taxOverrideId,
          note: l.note,
          widthM: l.widthM,
          heightM: l.heightM,
          discountId: l.autoDiscount?.id,
        })),
        promotionId: state.promotion?.id,
        payments,
        notes: state.note || undefined,
        couponCode: state.coupon?.code,
        couponOtp: state.coupon?.otp,
        invoiceDiscountMode: state.invoiceDiscountValue > 0 ? state.invoiceDiscountMode : undefined,
        invoiceDiscountValue: state.invoiceDiscountValue > 0 ? state.invoiceDiscountValue : undefined,
        shipping: state.shipping > 0 ? state.shipping : undefined,
        redeemPoints: state.redeemPoints > 0 ? state.redeemPoints : undefined,
        appliedCreditAmount: selectTotals(state).appliedCredit > 0 ? selectTotals(state).appliedCredit : undefined,
        mode,
        customFields: state.customFields.some((v) => v.trim()) ? state.customFields : undefined,
        additionalExpenses: (() => {
          const filled = state.additionalExpenses.filter((e) => e.key.trim());
          return filled.length > 0 ? filled : undefined;
        })(),
        taxExemptionReasonCode: state.taxExemptionReasonCode ?? undefined,
        priceListId: state.priceListId ?? undefined,
        payTermNumber: state.payTermNumber ?? undefined,
        payTermType: state.payTermType ?? undefined,
        documentPath: state.documentPath ?? undefined,
        documentOriginalName: state.documentOriginalName ?? undefined,
        channel: layout === "table" ? "ADD_SALE" : "POS",
      },
      {
        onSuccess: (sale) => {
          setCompletedSale(sale);
          setPaymentOpen(false);
          setPaymentRows([]);
          store.clear();
          if (print) window.open(`/invoices/${sale.id}`, "_blank");
        },
        onError: (err) => {
          const msg = isAxiosError(err) && err.response?.data?.message ? err.response.data.message : t("common.somethingWentWrong");
          notify(msg);
        },
      },
    );
  }

  // Shared by "Save as Quote" and "Save as Delivery" (and, while editingDraft is set, their
  // "Update Quote"/"Update Delivery" replacements - see InvoicePanel.tsx's editingKind prop) -
  // all the exact same DRAFT-sale payload, just posted to a different endpoint/method (see
  // posApi.ts's useCreateQuote/useCreateDelivery/useUpdateQuote and Sale.isQuotation's schema
  // comment).
  function saveAsDraft(kind: "quote" | "delivery") {
    const state = usePosStore.getState();
    if (state.lines.length === 0) return notify(isAr ? "السلة فارغة" : "Cart is empty");
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer");

    const payload = {
      businessLocationId: effectiveLocationId!,
      customerId: state.customer.id,
      items: (state.promotion?.originalLines ?? state.lines).map((l) => ({
        ...(l.type === "PRODUCT" ? { productId: l.id } : { serviceId: l.id }),
        quantity: l.quantity,
        discountAmount: l.discountAmount,
        unitPriceOverride: l.unitPriceOverride,
        taxId: l.taxOverrideId,
        note: l.note,
        widthM: l.widthM,
        heightM: l.heightM,
        discountId: l.autoDiscount?.id,
      })),
      promotionId: state.promotion?.id,
      payments: [],
      notes: state.note || undefined,
      couponCode: state.coupon?.code,
        couponOtp: state.coupon?.otp,
      invoiceDiscountMode: state.invoiceDiscountValue > 0 ? state.invoiceDiscountMode : undefined,
      invoiceDiscountValue: state.invoiceDiscountValue > 0 ? state.invoiceDiscountValue : undefined,
      shipping: state.shipping > 0 ? state.shipping : undefined,
      mode,
      customFields: state.customFields.some((v) => v.trim()) ? state.customFields : undefined,
      additionalExpenses: (() => {
        const filled = state.additionalExpenses.filter((e) => e.key.trim());
        return filled.length > 0 ? filled : undefined;
      })(),
      taxExemptionReasonCode: state.taxExemptionReasonCode ?? undefined,
      priceListId: state.priceListId ?? undefined,
      payTermNumber: state.payTermNumber ?? undefined,
      payTermType: state.payTermType ?? undefined,
      documentPath: state.documentPath ?? undefined,
      documentOriginalName: state.documentOriginalName ?? undefined,
      channel: layout === "table" ? ("ADD_SALE" as const) : ("POS" as const),
    };

    const onError = (err: unknown) => {
      const msg = isAxiosError(err) && err.response?.data?.message ? err.response.data.message : t("common.somethingWentWrong");
      notify(msg);
    };

    if (editingDraft) {
      // An edit goes straight back to the list it came from - unlike a fresh save, there's no
      // new document number to show off, just the same one the cashier already had.
      updateQuote.mutate(
        { id: editingDraft.id, input: payload },
        {
          onSuccess: () => {
            store.clear();
            navigate(editingDraft.kind === "delivery" ? "/deliveries" : "/quotes");
          },
          onError,
        },
      );
    } else {
      const mutation = kind === "quote" ? createQuote : createDelivery;
      mutation.mutate(payload, {
        onSuccess: (sale) => {
          setCompletedSale(sale);
          setDraftKind(kind);
          setPaymentOpen(false);
          setPaymentRows([]);
          store.clear();
        },
        onError,
      });
    }
  }

  function startNewSale() {
    setCompletedSale(null);
    setDraftKind(null);
    setPaymentRows([]);
    setEditingDraft(null);
    store.clear();
    if (editQuoteId) navigate(editingDraft?.kind === "delivery" ? "/deliveries" : "/quotes");
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if (e.key === "F1") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        // Add Sale has no payment popup (see AddSalePaymentSection) - F2 only applies to the
        // touch-grid POS's click-to-pay modal.
        if (layout !== "table" && usePosStore.getState().lines.length > 0) openPayment(true);
      } else if (e.key === "F3") {
        e.preventDefault();
        const state = usePosStore.getState();
        if (state.lines.length > 0 && effectiveLocationId) {
          holdSale
            .mutateAsync({
              businessLocationId: effectiveLocationId,
              customerId: state.customer?.id,
              label: `Hold ${new Date().toLocaleTimeString()}`,
              mode,
              items: (state.promotion?.originalLines ?? state.lines).map((l) => ({
                productId: l.type === "PRODUCT" ? l.id : undefined,
                serviceId: l.type === "SERVICE" ? l.id : undefined,
                descriptionEn: l.nameEn,
                descriptionAr: l.nameAr,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxPercent: l.taxPercent,
                taxType: l.taxType,
                discountAmount: l.discountAmount,
              })),
            })
            .then(() => {
              store.clear();
              notify(isAr ? "تم التعليق" : "Sale held");
            })
            .catch(() => notify(isAr ? "تعذّر التعليق" : "Could not hold the sale"));
        }
      } else if (e.key === "F4") {
        e.preventDefault();
        startNewSale();
      } else if (e.key === "F5") {
        e.preventDefault();
        if (completedSale && !draftKind) window.open(`/invoices/${completedSale.id}`, "_blank");
      } else if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Delete" && !typing) {
        e.preventDefault();
        const lines = usePosStore.getState().lines;
        if (lines.length > 0) store.removeLine(lines[lines.length - 1].key);
      } else if (e.key === "Escape") {
        setPaymentOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSale, draftKind, isAr]);

  if (!effectiveLocationId) {
    return <div className="p-8 text-center text-sm text-slate-400">{isAr ? "اختر فرعًا" : "Select a business location"}</div>;
  }

  if (completedSale) {
    if (draftKind) {
      const isDelivery = draftKind === "delivery";
      return (
        <Card className="mx-auto max-w-md p-8 text-center">
          {isDelivery ? (
            <PackageCheck className="mx-auto mb-3 h-10 w-10 text-sky-500" strokeWidth={1.5} aria-hidden />
          ) : (
            <FileText className="mx-auto mb-3 h-10 w-10 text-sky-500" strokeWidth={1.5} aria-hidden />
          )}
          <h2 className="text-lg font-semibold text-slate-800">
            {isDelivery ? (isAr ? "تم حفظ التسليم" : "Delivery Saved") : isAr ? "تم حفظ عرض السعر" : "Quote Saved"}
          </h2>
          <p className="ltr-nums mt-1 text-2xl font-bold text-sky-700">{isDelivery ? completedSale.deliveryNumber : completedSale.quoteNumber}</p>
          <div className="ltr-nums mt-4 space-y-1 text-sm text-slate-600">
            <p>{isAr ? "الإجمالي" : "Total"}: {formatMoney(completedSale.totalAmount, currency, locale)}</p>
          </div>
          <div className="mt-6 flex gap-2">
            <Link
              to={isDelivery ? "/deliveries" : "/quotes"}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              {isDelivery ? (isAr ? "عرض التسليمات" : "View Deliveries") : isAr ? "عرض عروض الأسعار" : "View Quotes"}
            </Link>
            <Button onClick={startNewSale} className="flex-1">
              {isAr ? "بيع جديد (F4)" : "New Sale (F4)"}
            </Button>
          </div>
        </Card>
      );
    }
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" strokeWidth={1.5} aria-hidden />
        <h2 className="text-lg font-semibold text-slate-800">{isAr ? "تم إتمام البيع" : "Sale Completed"}</h2>
        <p className="ltr-nums mt-1 text-2xl font-bold text-sky-700">{completedSale.invoiceNumber}</p>
        <div className="ltr-nums mt-4 space-y-1 text-sm text-slate-600">
          <p>{isAr ? "الإجمالي" : "Total"}: {formatMoney(completedSale.totalAmount, currency, locale)}</p>
          <p>{isAr ? "المدفوع" : "Paid"}: {formatMoney(completedSale.paidAmount, currency, locale)}</p>
          <p>{isAr ? "المتبقي" : "Due"}: {formatMoney(completedSale.dueAmount, currency, locale)}</p>
        </div>
        {completedSale.estimatedReadyAt && (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
            {isAr ? "الجاهزية المتوقعة" : "Estimated ready"}:{" "}
            <span className="ltr-nums">{new Date(completedSale.estimatedReadyAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Link
            to={`/invoices/${completedSale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            {isAr ? "طباعة (F5)" : "Print (F5)"}
          </Link>
          <Button onClick={startNewSale} className="flex-1">
            {isAr ? "بيع جديد (F4)" : "New Sale (F4)"}
          </Button>
        </div>
      </Card>
    );
  }

  // Add Sale (`layout === "table"`) is a genuinely different page shape from the touch-grid POS,
  // not just a table swapped in for a product grid - the reference's own `sell/create.blade.php`
  // is a plain, full-width, top-to-bottom admin form (header -> customer -> line items -> totals
  // -> inline payment rows -> a single Save button), not a 2-column split with a cart sidebar and
  // a click-to-pay popup. Rendered as its own composition entirely - the touch-grid POS's
  // <InvoicePanel>-based layout below stays completely unchanged.
  if (layout === "table") {
    return (
      <div className="mx-auto max-w-5xl space-y-3 pb-10">
        <AddSaleHeader
          isAr={isAr}
          locations={locations}
          effectiveLocationId={effectiveLocationId}
          setLocationOverride={setLocationOverride}
          priceLists={priceLists ?? []}
        />
        <RegisterSessionBar businessLocationId={effectiveLocationId} currency={currency} locale={locale} isAr={isAr} notify={notify} />
        <PosBanner banner={banner} />

        <AddSaleCustomerSection isAr={isAr} />

        <SaleLineTable
          ref={searchRef}
          businessLocationId={effectiveLocationId}
          currency={currency}
          locale={locale}
          isAr={isAr}
          onOutOfStock={(name) => notify(isAr ? `${name}: نفد المخزون` : `${name}: out of stock`)}
          fixedMode={mode}
        />

        <AddSaleUtilityBar isAr={isAr} businessLocationId={effectiveLocationId} mode={mode} notify={notify} />

        <AddSaleTotalsSection isAr={isAr} currency={currency} locale={locale} businessLocationId={effectiveLocationId} mode={mode} notify={notify} />

        <AddSalePaymentSection isAr={isAr} currency={currency} locale={locale} paymentMethods={paymentMethods ?? []} rows={paymentRows} setRows={setPaymentRows} />

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {editingDraft ? (
            <Button onClick={() => void saveDraftWithPromotion(editingDraft.kind)} disabled={updateQuote.isPending}>
              {editingDraft.kind === "delivery" ? (
                <PackageCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
              ) : (
                <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {updateQuote.isPending
                ? "…"
                : editingDraft.kind === "delivery"
                  ? isAr
                    ? "تحديث التسليم"
                    : "Update Delivery"
                  : isAr
                    ? "تحديث عرض السعر"
                    : "Update Quote"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => void saveDraftWithPromotion("delivery")} disabled={createDelivery.isPending}>
                <PackageCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
                {createDelivery.isPending ? "…" : isAr ? "حفظ كتسليم" : "Save as Delivery"}
              </Button>
              <Button variant="outline" onClick={() => void saveDraftWithPromotion("quote")} disabled={createQuote.isPending}>
                <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                {createQuote.isPending ? "…" : isAr ? "حفظ كعرض سعر" : "Save as Quote"}
              </Button>
              <Button onClick={() => void completeSale(false)} disabled={checkout.isPending}>
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                {checkout.isPending ? "…" : isAr ? "حفظ" : "Save"}
              </Button>
              <Button variant="secondary" onClick={() => void completeSale(true)} disabled={checkout.isPending}>
                <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                {checkout.isPending ? "…" : isAr ? "حفظ وطباعة" : "Save & Print"}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PosHeaderBar isAr={isAr} />
      </div>
      <RegisterSessionBar businessLocationId={effectiveLocationId} currency={currency} locale={locale} isAr={isAr} notify={notify} />
      <PosBanner banner={banner} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,460px)_1fr]">
        <InvoicePanel
          currency={currency}
          locale={locale}
          isAr={isAr}
          businessLocationId={effectiveLocationId}
          paymentMethods={paymentMethods ?? []}
          paymentOpen={paymentOpen}
          setPaymentOpen={openPayment}
          onCompleteSale={completeSale}
          checkoutPending={checkout.isPending}
          onSaveAsQuote={() => void saveDraftWithPromotion("quote")}
          saveQuotePending={editingDraft ? updateQuote.isPending : createQuote.isPending}
          onSaveAsDelivery={() => void saveDraftWithPromotion("delivery")}
          saveDeliveryPending={editingDraft ? updateQuote.isPending : createDelivery.isPending}
          notify={notify}
          onRecent={() => navigate("/sales")}
          onPrintLast={() => notify(isAr ? "أكمل بيعًا أولاً للطباعة" : "Complete a sale first to print")}
          mode={mode}
          editingKind={editingDraft?.kind ?? null}
        />
        <ProductGrid
          ref={searchRef}
          businessLocationId={effectiveLocationId}
          currency={currency}
          locale={locale}
          isAr={isAr}
          onOutOfStock={(name) => notify(isAr ? `${name}: نفد المخزون` : `${name}: out of stock`)}
          fixedMode={mode === "SERVICE" ? "SERVICES" : mode === "PRODUCT" ? "PRODUCTS" : undefined}
        />
      </div>
    </div>
  );
}

/**
 * Fixed, top-center toast - the touch-grid POS's Payment/BNPL dialogs are full-screen `Modal`s at
 * z-50, so a banner sitting in the normal page flow (as this used to be) renders invisibly behind
 * them the moment a modal is open, which is exactly when a blocking error (e.g. "add a payment
 * method first") most needs to be seen.
 */
function PosBanner({ banner }: { banner: string | null }) {
  if (!banner) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">{banner}</div>
    </div>
  );
}

/**
 * Compact Hold / Held / Recent / Clear row for Add Sale - the reference's own Add Sale form has
 * no equivalent (holding a sale is a touch-POS convenience), but this app already has the
 * feature built and working (F3 shortcut, `useHoldSale`/`useHeldSales`) - dropping it here would
 * be removing a working capability, not converting the reference, so it stays as a small
 * utility row rather than living inside the touch-grid POS's `InvoicePanel` sidebar.
 */
function AddSaleUtilityBar({
  isAr,
  businessLocationId,
  mode,
  notify,
}: {
  isAr: boolean;
  businessLocationId: string;
  mode?: "SERVICE" | "PRODUCT";
  notify: (m: string) => void;
}) {
  const store = usePosStore();
  const lines = usePosStore((s) => s.lines);
  const customer = usePosStore((s) => s.customer);
  const hasLines = lines.length > 0;
  const [heldOpen, setHeldOpen] = useState(false);

  const { data: heldSales } = useHeldSales(businessLocationId, mode);
  const holdSale = useHoldSale();
  const resumeHeldSale = useResumeHeldSale();
  const discardHeldSale = useDiscardHeldSale();

  const pill =
    "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

  async function holdCurrent() {
    if (!hasLines) return;
    try {
      await holdSale.mutateAsync({
        businessLocationId,
        customerId: customer?.id,
        label: `Hold ${new Date().toLocaleTimeString()}`,
        mode,
        items: (usePosStore.getState().promotion?.originalLines ?? lines).map((l) => ({
          productId: l.type === "PRODUCT" ? l.id : undefined,
          serviceId: l.type === "SERVICE" ? l.id : undefined,
          descriptionEn: l.nameEn,
          descriptionAr: l.nameAr,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxPercent: l.taxPercent,
          taxType: l.taxType,
          discountAmount: l.discountAmount,
        })),
      });
      store.clear();
      notify(isAr ? "تم تعليق الفاتورة" : "Sale held");
    } catch {
      notify(isAr ? "تعذّر تعليق الفاتورة" : "Could not hold the sale");
    }
  }

  async function resume(id: string) {
    try {
      const held = await resumeHeldSale.mutateAsync(id);
      store.loadCart(
        held.items.map((item) => ({
          key: `${item.productId ? "PRODUCT" : "SERVICE"}:${item.productId ?? item.serviceId}`,
          type: item.productId ? "PRODUCT" : "SERVICE",
          id: (item.productId ?? item.serviceId)!,
          nameEn: item.descriptionEn,
          nameAr: item.descriptionAr ?? item.descriptionEn,
          sku: undefined,
          barcode: null,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          taxType: item.taxType,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
          manageStock: false,
          unit: "",
        })),
        held.customer ? { id: held.customerId!, nameEn: held.customer.nameEn, nameAr: held.customer.nameAr, phone: "", balance: "0" } : null,
      );
      setHeldOpen(false);
      notify(isAr ? "تم استئناف الفاتورة" : "Sale resumed");
    } catch {
      notify(isAr ? "تعذّر استئناف الفاتورة" : "Could not resume the sale");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={holdCurrent} disabled={!hasLines || holdSale.isPending} className={pill}>
        <CirclePause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "تعليق" : "Hold"}
      </button>

      <div className="relative">
        <button onClick={() => setHeldOpen((v) => !v)} className={pill}>
          <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {isAr ? "المعلّقة" : "Held"} {(heldSales?.length ?? 0) > 0 && `(${heldSales!.length})`}
        </button>
        {heldOpen && (
          <div className="absolute top-full start-0 z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {(heldSales?.length ?? 0) === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">{isAr ? "لا توجد فواتير معلّقة" : "No held sales"}</p>}
            {heldSales?.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{h.label}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    {h.customer ? (isAr ? h.customer.nameAr || h.customer.nameEn : h.customer.nameEn) : isAr ? "عميل نقدي" : "Walk-in"} · {h.items.length} {isAr ? "صنف" : "items"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => resume(h.id)} className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-200">
                    {isAr ? "استئناف" : "Resume"}
                  </button>
                  <button onClick={() => discardHeldSale.mutate(h.id)} className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-200">
                    {isAr ? "حذف" : "Discard"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link to="/sales" className={pill}>
        <Receipt className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "الفواتير الأخيرة" : "Recent"}
      </Link>
      <button
        onClick={() => {
          store.clear();
          notify(isAr ? "تم تفريغ السلة" : "Cart cleared");
        }}
        disabled={!hasLines}
        className={`${pill} !bg-red-50 !text-red-600 hover:!bg-red-100`}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "تفريغ" : "Clear"}
      </button>
    </div>
  );
}

/**
 * The reference's own "Add Sale" header (`sell/create.blade.php`, above the line-items table) -
 * a genuinely separate form section from the touch-grid POS's compact customer bar, not something
 * to fold into the shared InvoicePanel. Converts: the Business Location select (reference shows
 * this unconditionally whenever the business has any locations, not gated on having more than
 * one - the earlier `locations.length > 1` gate here was wrong), a per-sale Selling Price Group
 * override (only shown when there's more than one to pick, matching the reference's own
 * `count($price_groups) > 1` gate), and Pay Term Number/Type (pre-filled from the customer via
 * posStore.setCustomer, independently editable here). The Billing/Shipping Address display lives
 * in InvoicePanel's CustomerBar instead (via its `showAddressBlock` prop) - the reference itself
 * renders that text directly under the customer field, inside the SAME form-group, not as a
 * separate block elsewhere on the page.
 *
 * Deliberately NOT converted here, and why (see the memory entry for full reasoning):
 * Invoice Scheme + manual Invoice No. override (both would conflict with this app's ZATCA
 * hash-chain integrity - every FINAL sale's icv/invoiceHash already depends on strict sequential
 * per-location numbering), the reference's separate "Draft" and "Proforma" statuses (only
 * Final/Quotation exist end-to-end here - see the Status field's own history), Commission Agent /
 * Sales Order / Promotions / Recurring-Subscription / Types of Service (tied to verticals this
 * codebase doesn't have), Sale Date override (no `change_system_op_date`-equivalent permission
 * exists). Attach Document is now built for real (Round 30) - see posApi.ts's
 * useUploadSaleDocument and backend/src/middleware/upload.ts's uploadSaleDocument.
 */
function AddSaleHeader({
  isAr,
  locations,
  effectiveLocationId,
  setLocationOverride,
  priceLists,
}: {
  isAr: boolean;
  locations: BusinessLocation[];
  effectiveLocationId: string | null;
  setLocationOverride: (id: string) => void;
  priceLists: PriceListRow[];
}) {
  const priceListId = usePosStore((s) => s.priceListId);
  const setPriceListId = usePosStore((s) => s.setPriceListId);
  const payTermNumber = usePosStore((s) => s.payTermNumber);
  const payTermType = usePosStore((s) => s.payTermType);
  const setPayTerm = usePosStore((s) => s.setPayTerm);
  const documentOriginalName = usePosStore((s) => s.documentOriginalName);
  const setDocument = usePosStore((s) => s.setDocument);
  const uploadDocument = useUploadSaleDocument();
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onDocumentSelected(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    try {
      const result = await uploadDocument.mutateAsync(file);
      setDocument(result.documentPath, result.documentOriginalName);
    } catch {
      setUploadError(isAr ? "تعذّر رفع الملف (الحد الأقصى 9 ميجابايت)" : "Could not upload the file (max 9MB)");
    }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>
            <MapPin className="me-1 inline h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            {isAr ? "الفرع" : "Business Location"}
          </label>
          <select value={effectiveLocationId ?? ""} onChange={(e) => setLocationOverride(e.target.value)} className={cn(selectClass)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>

        {priceLists.length > 1 && (
          <div>
            <label className={labelClass}>
              <Banknote className="me-1 inline h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
              {isAr ? "قائمة الأسعار" : "Selling Price Group"}
            </label>
            <select value={priceListId ?? ""} onChange={(e) => setPriceListId(e.target.value || null)} className={selectClass}>
              <option value="">{isAr ? "الافتراضي" : "Default Selling Price"}</option>
              {priceLists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            <Calendar className="me-1 inline h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            {isAr ? "شرط الدفع" : "Pay Term"}
          </label>
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              value={payTermNumber ?? ""}
              onChange={(e) => setPayTerm(e.target.value ? Number(e.target.value) : null, payTermType)}
              placeholder={isAr ? "العدد" : "Number"}
              className={cn(inputClass, "ltr-nums w-1/2")}
            />
            <select
              value={payTermType ?? ""}
              onChange={(e) => setPayTerm(payTermNumber, (e.target.value || null) as "DAYS" | "MONTHS" | null)}
              className={cn(inputClass, "w-1/2")}
            >
              <option value="">{isAr ? "اختر" : "Please Select"}</option>
              <option value="DAYS">{isAr ? "أيام" : "Days"}</option>
              <option value="MONTHS">{isAr ? "أشهر" : "Months"}</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            <Paperclip className="me-1 inline h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            {isAr ? "إرفاق مستند" : "Attach Document"}
          </label>
          {documentOriginalName ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-600">{documentOriginalName}</span>
              <button
                type="button"
                onClick={() => setDocument(null, null)}
                className="shrink-0 text-slate-400 hover:text-red-500"
                aria-label={isAr ? "إزالة" : "remove"}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png"
              onChange={(e) => onDocumentSelected(e.target.files?.[0])}
              disabled={uploadDocument.isPending}
              className={cn(inputClass, "cursor-pointer py-1 text-xs file:me-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium")}
            />
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            {uploadDocument.isPending
              ? isAr
                ? "جارٍ الرفع…"
                : "Uploading…"
              : isAr
                ? "الحد الأقصى 9 ميجابايت: PDF, CSV, ZIP, DOC, DOCX, JPEG, JPG, PNG"
                : "Max 9MB: PDF, CSV, ZIP, DOC, DOCX, JPEG, JPG, PNG"}
          </p>
          {uploadError && <p className="mt-1 text-[11px] text-red-600">{uploadError}</p>}
        </div>
      </div>
    </Card>
  );
}
