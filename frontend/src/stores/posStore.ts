import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { calcLine } from "../lib/posCalc";
import type { PromotionApplyResult, PromotionType } from "../api/promotionsApi";
import type { MatchedDiscount } from "../api/discountsApi";

/**
 * POS state (Zustand). Holds everything the cashier is building: the cart, the selected
 * customer, invoice-level discount and shipping, tentative payments, and any parked/held sales.
 *
 * All money math for the on-screen preview lives in `selectTotals`. The backend independently
 * recalculates on checkout and is the authoritative source - this is display only.
 */

export type LineKind = "PRODUCT" | "SERVICE";

export interface PosLine {
  key: string; // `${type}:${id}` - unique per cart row
  type: LineKind;
  id: string;
  nameEn: string;
  nameAr: string;
  sku?: string;
  barcode?: string | null;
  unitPrice: number;
  taxPercent: number;
  taxType: "INCLUSIVE" | "EXCLUSIVE";
  quantity: number;
  discountAmount: number; // per-line, in currency
  stockOnHand?: number;
  manageStock?: boolean;
  unit: string;
  // Reference's per-line edit modal (row_edit_product_price_modal.blade.php) - unitPriceOverride/
  // taxOverrideId only ever actually apply server-side for a caller holding pos.editLinePrice (see
  // pos.service.ts's priceLine()); the catalog unitPrice/taxPercent above are left untouched so
  // clearing an override just means dropping these two fields.
  unitPriceOverride?: number;
  taxOverrideId?: string;
  taxOverridePercent?: number;
  note?: string;
  // Laundry's own dimension-based pricing (carpets/curtains priced per m²).
  widthM?: number;
  heightM?: number;
  // Set on the rows a promotion split off and discounted (reference's promotion_row_N) - a
  // Bonus row the promotion added on top of the cart is also `promoFree`.
  promotionId?: string;
  promoFree?: boolean;
  // Promotions > Discounts: the branch discount pre-filled as this line's discount (reference
  // getProductDiscount). Its amount follows the quantity/price until the cashier types their own
  // line discount (`manualDiscount`), which drops it - exactly like overwriting the pre-filled value.
  autoDiscount?: { id: string; name: string; discountType: "FIXED" | "PERCENTAGE"; amount: number; endsAt: string };
  manualDiscount?: boolean;
}

export interface PosCustomer {
  id: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
  balance: string;
  rewardPoints?: number;
  cashBack?: string;
  // Reference's Add Sale header - Billing/Shipping Address display + Pay Term pre-fill (see
  // AddSaleHeader in PosPage.tsx). Optional since the touch-grid POS's customer flows never
  // needed this and shouldn't have to supply it.
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  shippingAddress?: string | null;
  paymentTermsDays?: number;
  payTermType?: "DAYS" | "MONTHS" | null;
}

export type DiscountMode = "PERCENT" | "FIXED";

export interface PosPayment {
  id: string;
  paymentMethodId: string;
  label: string;
  amount: number;
  referenceNumber?: string; // BnplSession id for BNPL tenders; a free-typed reference/transaction no. for everything else
  note?: string; // reference's per-row `payment[$row_index][note]`
  // Cash tendered by the customer for this row (client-only - never sent to checkout, which only
  // ever sees `amount`) - lets the split-tender UI show "Change: X" when tendered exceeds amount,
  // without inflating what's actually recorded as paid on the sale.
  tendered?: number;
  // True for a row added by a fixed-amount flow (BNPL capture, cashback) whose amount/method are
  // tied to something else (an approved session, a capped balance) and must not be hand-edited.
  locked?: boolean;
}

/**
 * The promotion applied to the cart (reference POS "Promotion" Apply). `lines` then holds the
 * split/discounted rows the server returned for display and totals, while `originalLines` keeps
 * the cart exactly as the cashier built it - that is what checkout sends back (with the promotion
 * id) for the server to re-run the same promotion on. Editing the cart drops the promotion.
 */
export interface AppliedPromotion {
  id: string;
  name: string;
  type: PromotionType;
  fullCash: boolean;
  cashBack: number | null;
  originalLines: PosLine[];
}

/**
 * The coupon on the cart (reference POS "Apply Coupon"). It is a line discount on the lines it
 * fits: `lineDiscounts[i]` is the coupon's share of `lines[i]`, as the server fitted it (the
 * promotion's split rows when a promotion is on the cart). Any change to the cart drops it - the
 * cashier applies it again - exactly like a promotion. Without "Added Discount" the coupon
 * replaces every other discount: the promotion is cancelled and line discounts are cleared.
 */
export interface AppliedCoupon {
  code: string;
  name: string;
  addedDiscount: boolean;
  discountAmount: number;
  lineDiscounts: number[];
  /** The customer's verification code, for a coupon with OTP on - checkout re-checks it. */
  otp?: string;
}

// Reference's own 4 fixed additional_expense_key_N/_value_N slots - untaxed flat pass-through
// charges (see pos.service.ts's checkout()). A slot with an empty key is dropped at checkout
// time rather than sent as a nameless amount.
export interface AdditionalExpenseSlot {
  key: string;
  value: number;
}

const EMPTY_ADDITIONAL_EXPENSES: AdditionalExpenseSlot[] = [
  { key: "", value: 0 },
  { key: "", value: 0 },
  { key: "", value: 0 },
  { key: "", value: 0 },
];

// Must match POINT_VALUE in backend/src/modules/pos/pos.service.ts - 1 point = this many
// currency units off. Kept in sync manually since there's no shared config source yet.
export const LOYALTY_POINT_VALUE = 0.1;

// Currency-safe rounding for a value that's been through chained float math (tax rate * base,
// percentage discounts, etc.) - plain `.toFixed(2)` on a raw chained float can round the wrong
// way (e.g. a "true" 21.275 that's actually stored as 21.274999999999998 rounds down to "21.27"
// instead of up to "21.28"). Every monetary value selectTotals() returns goes through this before
// it reaches a consumer - critical for the cash/card/online auto-fill buttons in PaymentModal,
// which submit this number directly as the payment amount, not just display it.
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface PosState {
  lines: PosLine[];
  customer: PosCustomer | null;
  invoiceDiscountMode: DiscountMode;
  invoiceDiscountValue: number;
  shipping: number;
  redeemPoints: number;
  appliedCreditAmount: number; // store credit the cashier wants applied to THIS invoice
  payments: PosPayment[];
  coupon: AppliedCoupon | null;
  promotion: AppliedPromotion | null;
  note: string;
  customFields: string[]; // reference's sell-level custom_field_1..4, by index
  additionalExpenses: AdditionalExpenseSlot[]; // reference's 4 fixed named expense slots
  taxExemptionReasonCode: string | null;
  // Reference's Add Sale header (`sell/create.blade.php`) - a per-sale Selling Price Group
  // override (distinct from the customer/location-derived default - see pos.service.ts's
  // checkout()) and a per-sale Pay Term (pre-filled from the picked customer's own configured
  // term on setCustomer, then independently editable), used only to compute Sale.dueDate.
  priceListId: string | null;
  payTermNumber: number | null;
  payTermType: "DAYS" | "MONTHS" | null;
  // Reference's Add Sale "Attach Document" - set once the file has actually finished uploading
  // (see useUploadSaleDocument in posApi.ts); documentOriginalName is what the cashier sees/typed,
  // documentPath is the opaque server path threaded into the checkout payload.
  documentPath: string | null;
  documentOriginalName: string | null;

  addItem: (item: Omit<PosLine, "key" | "quantity" | "discountAmount"> & { quantity?: number }) => void;
  incQty: (key: string) => void;
  decQty: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  setLineDiscount: (key: string, amount: number) => void;
  setLineUnitPriceOverride: (key: string, price: number | null) => void;
  setLineTaxOverride: (key: string, taxId: string | null, taxPercent?: number) => void;
  setLineNote: (key: string, note: string) => void;
  setLineDimensions: (key: string, widthM: number | null, heightM: number | null) => void;
  removeLine: (key: string) => void;
  clear: () => void;

  setCustomer: (c: PosCustomer | null) => void;
  setInvoiceDiscount: (mode: DiscountMode, value: number) => void;
  setShipping: (amount: number) => void;
  setRedeemPoints: (points: number) => void;
  setAppliedCreditAmount: (amount: number) => void;
  setNote: (note: string) => void;
  setCoupon: (coupon: AppliedCoupon | null) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  applyPromotion: (result: Extract<PromotionApplyResult, { applied: true }>) => void;
  cancelPromotion: () => void;
  /** Server matches for the cart's items, keyed "p:<id>" / "s:<id>". */
  applyDiscounts: (matches: Record<string, MatchedDiscount>) => void;
  setCustomField: (index: number, value: string) => void;
  setAdditionalExpense: (index: number, slot: AdditionalExpenseSlot) => void;
  setTaxExemptionReasonCode: (code: string | null) => void;
  setPriceListId: (id: string | null) => void;
  setPayTerm: (number: number | null, type: "DAYS" | "MONTHS" | null) => void;
  setDocument: (path: string | null, originalName: string | null) => void;

  addPayment: (p: Omit<PosPayment, "id">) => void;
  updatePayment: (id: string, patch: Partial<Omit<PosPayment, "id">>) => void;
  removePayment: (id: string) => void;
  clearPayments: () => void;

  /** Replaces the cart with lines/customer resumed from a server-persisted held sale. */
  loadCart: (lines: PosLine[], customer: PosCustomer | null) => void;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

// The cart as the cashier built it - the promotion's split rows are only a view over it.
const baseLines = (state: PosState) => state.promotion?.originalLines ?? state.lines;
// A promotion-split row ("KEY#1") has no counterpart in the original cart; editing it just drops
// the promotion.
const isSplitKey = (key: string) => key.includes("#");
/** A pre-filled discount's amount on the line: "percentage" of the line, "fixed" off each unit. */
export function autoDiscountAmount(line: PosLine) {
  if (!line.autoDiscount) return line.discountAmount;
  const qty = line.widthM != null && line.heightM != null ? line.quantity * line.widthM * line.heightM : line.quantity;
  const price = line.unitPriceOverride ?? line.unitPrice;
  const gross = price * qty;
  const d = line.autoDiscount;
  const amount = d.discountType === "PERCENTAGE" ? (gross * Math.min(d.amount, 100)) / 100 : Math.min(d.amount, price) * qty;
  return roundMoney(Math.max(0, Math.min(amount, gross)));
}
const withAutoDiscount = (l: PosLine): PosLine => (l.autoDiscount && !l.manualDiscount ? { ...l, discountAmount: autoDiscountAmount(l) } : l);
const editLine = (state: PosState, key: string, fn: (l: PosLine) => PosLine) => ({
  promotion: null,
  coupon: null,
  lines: isSplitKey(key) ? baseLines(state) : baseLines(state).map((l) => (l.key === key ? withAutoDiscount(fn(l)) : l)),
});
const itemKeyOf = (l: PosLine) => `${l.type === "PRODUCT" ? "p" : "s"}:${l.id}`;

export const usePosStore = create<PosState>((set) => ({
  lines: [],
  customer: null,
  invoiceDiscountMode: "FIXED",
  invoiceDiscountValue: 0,
  shipping: 0,
  redeemPoints: 0,
  appliedCreditAmount: 0,
  payments: [],
  coupon: null,
  promotion: null,
  note: "",
  customFields: ["", "", "", ""],
  additionalExpenses: EMPTY_ADDITIONAL_EXPENSES,
  taxExemptionReasonCode: null,
  priceListId: null,
  payTermNumber: null,
  payTermType: null,
  documentPath: null,
  documentOriginalName: null,

  addItem: (item) =>
    set((state) => {
      const key = `${item.type}:${item.id}`;
      const lines = baseLines(state);
      const existing = lines.find((l) => l.key === key);
      if (existing) {
        // Duplicate scan/click bumps quantity instead of adding a second row.
        return {
          promotion: null,
          coupon: null,
          lines: lines.map((l) => (l.key === key ? withAutoDiscount({ ...l, quantity: l.quantity + (item.quantity ?? 1) }) : l)),
        };
      }
      const line: PosLine = { ...item, key, quantity: item.quantity ?? 1, discountAmount: 0 };
      return { promotion: null, coupon: null, lines: [...lines, line] };
    }),

  incQty: (key) => set((state) => editLine(state, key, (l) => ({ ...l, quantity: l.quantity + 1 }))),

  decQty: (key) => set((state) => editLine(state, key, (l) => ({ ...l, quantity: Math.max(1, l.quantity - 1) }))),

  setQty: (key, qty) => set((state) => editLine(state, key, (l) => ({ ...l, quantity: Math.max(1, Math.floor(qty) || 1) }))),

  setLineDiscount: (key, amount) =>
    set((state) => editLine(state, key, (l) => ({ ...l, discountAmount: Math.max(0, amount), autoDiscount: undefined, manualDiscount: true }))),

  setLineUnitPriceOverride: (key, price) => set((state) => editLine(state, key, (l) => ({ ...l, unitPriceOverride: price ?? undefined }))),

  setLineTaxOverride: (key, taxId, taxPercent) =>
    set((state) => editLine(state, key, (l) => ({ ...l, taxOverrideId: taxId ?? undefined, taxOverridePercent: taxId ? taxPercent : undefined }))),

  setLineNote: (key, note) =>
    set((state) => {
      // A note doesn't change prices - keep the promotion and note every row of that item.
      const root = key.split("#")[0];
      const patch = (l: PosLine) => (l.key.split("#")[0] === root ? { ...l, note: note || undefined } : l);
      return state.promotion
        ? { lines: state.lines.map(patch), promotion: { ...state.promotion, originalLines: state.promotion.originalLines.map(patch) } }
        : { lines: state.lines.map(patch) };
    }),

  setLineDimensions: (key, widthM, heightM) =>
    set((state) => editLine(state, key, (l) => ({ ...l, widthM: widthM ?? undefined, heightM: heightM ?? undefined }))),

  removeLine: (key) =>
    set((state) => ({ promotion: null, coupon: null, lines: isSplitKey(key) ? baseLines(state) : baseLines(state).filter((l) => l.key !== key) })),

  clear: () =>
    set({
      lines: [],
      payments: [],
      invoiceDiscountValue: 0,
      shipping: 0,
      redeemPoints: 0,
      appliedCreditAmount: 0,
      coupon: null,
      promotion: null,
      note: "",
      customFields: ["", "", "", ""],
      additionalExpenses: EMPTY_ADDITIONAL_EXPENSES,
      taxExemptionReasonCode: null,
      priceListId: null,
      payTermNumber: null,
      payTermType: null,
      documentPath: null,
      documentOriginalName: null,
    }),

  setCustomer: (customer) =>
    set((state) => ({
      customer,
      // Reference pos.js cancels the promotion (and the coupon) whenever the customer changes.
      promotion: null,
      coupon: null,
      lines: baseLines(state),
      redeemPoints: 0,
      appliedCreditAmount: 0,
      // Reference's own Add Sale JS pre-fills pay_term_number/pay_term_type from whichever
      // customer is picked - mirrored here so the header inputs start correct, though the
      // cashier can still edit them independently afterward.
      payTermNumber: customer?.paymentTermsDays ? customer.paymentTermsDays : null,
      payTermType: customer?.paymentTermsDays ? (customer.payTermType ?? null) : null,
    })),
  setInvoiceDiscount: (invoiceDiscountMode, invoiceDiscountValue) =>
    set({ invoiceDiscountMode, invoiceDiscountValue: Math.max(0, invoiceDiscountValue) }),
  setShipping: (shipping) => set({ shipping: Math.max(0, shipping) }),
  setRedeemPoints: (points) =>
    set((state) => ({ redeemPoints: Math.max(0, Math.min(Math.floor(points) || 0, state.customer?.rewardPoints ?? 0)) })),
  setAppliedCreditAmount: (amount) =>
    set((state) => {
      const availableCredit = state.customer && Number(state.customer.balance) < 0 ? -Number(state.customer.balance) : 0;
      return { appliedCreditAmount: Math.max(0, Math.min(amount, availableCredit)) };
    }),
  setNote: (note) => set({ note }),
  setCoupon: (coupon) => set({ coupon }),
  // Reference applyCouponSuccess: a coupon without "Added Discount" cancels the promotion and
  // zeroes every line discount first; `lineDiscounts` were fitted by the server to that cart.
  applyCoupon: (coupon) =>
    set((state) =>
      coupon.addedDiscount
        ? { coupon }
        : { coupon, promotion: null, lines: baseLines(state).map((l) => ({ ...l, discountAmount: 0, autoDiscount: undefined, manualDiscount: undefined })) },
    ),
  applyPromotion: (result) =>
    set((state) => {
      const originals = baseLines(state);
      const seen = new Map<string, number>();
      const lines = result.items.map((item) => {
        const src = originals[item.sourceIndex];
        const n = seen.get(src.key) ?? 0;
        seen.set(src.key, n + 1);
        return {
          ...src,
          key: n === 0 ? src.key : `${src.key}#${n}`,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
          promotionId: item.promoted ? result.promotion.id : undefined,
          promoFree: item.free || undefined,
        };
      });
      const { id, name, type, fullCash } = result.promotion;
      return { lines, coupon: null, promotion: { id, name, type, fullCash, cashBack: result.cashBack, originalLines: originals } };
    }),
  cancelPromotion: () => set((state) => ({ promotion: null, coupon: null, lines: baseLines(state) })),
  applyDiscounts: (matches) =>
    set((state) => {
      // A coupon without "Added Discount" replaced the line discounts - don't put them back under it.
      if (state.coupon && !state.coupon.addedDiscount) return {};
      let changed = false;
      const lines = baseLines(state).map((l) => {
        if (l.manualDiscount) return l;
        const m = matches[itemKeyOf(l)];
        if (!m) {
          if (!l.autoDiscount) return l;
          changed = true;
          return { ...l, autoDiscount: undefined, discountAmount: 0 };
        }
        const auto = { id: m.id, name: m.name, discountType: m.discountType, amount: Number(m.discountAmount), endsAt: m.endsAt };
        if (l.autoDiscount && l.autoDiscount.id === auto.id && l.autoDiscount.amount === auto.amount && l.autoDiscount.discountType === auto.discountType) return l;
        changed = true;
        return withAutoDiscount({ ...l, autoDiscount: auto });
      });
      // A changed line discount changes the cart, so an applied promotion / coupon is dropped with it.
      return changed ? { lines, promotion: null, coupon: null } : {};
    }),
  setCustomField: (index, value) =>
    set((state) => ({ customFields: state.customFields.map((v, i) => (i === index ? value : v)) })),
  setAdditionalExpense: (index, slot) =>
    set((state) => ({ additionalExpenses: state.additionalExpenses.map((s, i) => (i === index ? slot : s)) })),
  setTaxExemptionReasonCode: (code) => set({ taxExemptionReasonCode: code }),
  setPriceListId: (id) => set((state) => ({ priceListId: id, promotion: null, coupon: null, lines: baseLines(state) })),
  setPayTerm: (number, type) => set({ payTermNumber: number, payTermType: type }),
  setDocument: (path, originalName) => set({ documentPath: path, documentOriginalName: originalName }),

  addPayment: (p) => set((state) => ({ payments: [...state.payments, { ...p, id: uid() }] })),
  updatePayment: (id, patch) =>
    set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
  removePayment: (id) => set((state) => ({ payments: state.payments.filter((p) => p.id !== id) })),
  clearPayments: () => set({ payments: [] }),

  loadCart: (lines, customer) =>
    set({
      lines,
      customer,
      payments: [],
      invoiceDiscountValue: 0,
      shipping: 0,
      redeemPoints: 0,
      appliedCreditAmount: 0,
      coupon: null,
      promotion: null,
      customFields: ["", "", "", ""],
      additionalExpenses: EMPTY_ADDITIONAL_EXPENSES,
      taxExemptionReasonCode: null,
      priceListId: null,
      payTermNumber: null,
      payTermType: null,
      documentPath: null,
      documentOriginalName: null,
    }),
}));

export interface PosTotals {
  itemCount: number;
  quantityTotal: number;
  subtotal: number; // raw goods subtotal, net of line discounts, before tax - for display only
  lineDiscountTotal: number;
  invoiceDiscountAmount: number;
  couponDiscountAmount: number;
  pointsDiscountAmount: number;
  redeemedPoints: number; // may be less than requested if the cart can't absorb the full value
  discountTotal: number; // line + invoice + coupon + points
  taxAmount: number; // final VAT actually charged (on the discounted, shipping-inclusive base)
  shipping: number;
  additionalExpensesTotal: number; // untaxed flat pass-through charges, added after tax
  grandTotal: number;
  paid: number;
  availableCredit: number; // customer's total store credit on hand (from a negative balance)
  appliedCredit: number; // portion of availableCredit actually usable against this invoice's due
  due: number; // after cash/card/online payments AND applied store credit
}

/**
 * Pure totals from a snapshot of the store. Use usePosTotals() in components; getState() elsewhere.
 *
 * Mirrors pos.service.ts checkout() exactly: the coupon is a line discount on the lines it fits
 * (folded into those lines' taxable base), then the invoice discount comes off the result,
 * shipping is added to the taxable base as a real charge (not a flat untaxed add-on), and tax is
 * recomputed on that final base using the cart's blended (line-level) tax rate. Keeping this
 * identical to the backend is what prevents another preview/checkout mismatch like the one found
 * in the coupon feature (P1-4).
 */
export function selectTotals(state: PosState): PosTotals {
  let subtotal = 0;
  let lineTaxAmount = 0;
  let lineDiscountTotal = 0;
  let quantityTotal = 0;

  let couponDiscountAmount = 0;
  state.lines.forEach((line, i) => {
    // The coupon is a line discount (pos.service.ts applyCouponToLines) - it lowers this line's
    // taxable base, so it is folded into the line before tax, not taken off the invoice after.
    const couponShare = state.coupon?.lineDiscounts[i] ?? 0;
    const t = calcLine(couponShare ? { ...line, discountAmount: line.discountAmount + couponShare } : line);
    subtotal += t.subtotal;
    lineTaxAmount += t.taxAmount;
    lineDiscountTotal += line.discountAmount;
    couponDiscountAmount += couponShare;
    quantityTotal += line.quantity;
  });
  const subtotalAfterCoupon = subtotal;

  const rawInvoiceDiscount =
    state.invoiceDiscountMode === "PERCENT"
      ? (subtotalAfterCoupon * state.invoiceDiscountValue) / 100
      : state.invoiceDiscountValue;
  const invoiceDiscountAmount = Math.min(Math.max(0, rawInvoiceDiscount), subtotalAfterCoupon);
  const subtotalAfterInvoiceDiscount = subtotalAfterCoupon - invoiceDiscountAmount;

  // Points redemption: floored to whole points, capped both by the customer's balance and by
  // what the remaining subtotal can actually absorb - matches pos.service.ts checkout() exactly.
  const requestedPoints = Math.max(0, Math.min(state.redeemPoints, state.customer?.rewardPoints ?? 0));
  const maxAffordablePoints = Math.floor(subtotalAfterInvoiceDiscount / LOYALTY_POINT_VALUE);
  const redeemedPoints = Math.min(requestedPoints, maxAffordablePoints);
  const pointsDiscountAmount = redeemedPoints * LOYALTY_POINT_VALUE;

  const effectiveTaxRate = subtotal > 0 ? lineTaxAmount / subtotal : 0;
  const finalSubtotal = subtotalAfterInvoiceDiscount - pointsDiscountAmount + state.shipping;
  const taxAmount = finalSubtotal * effectiveTaxRate;

  // Additional expenses (reference's 4 fixed named slots) are untaxed flat pass-through charges,
  // added straight onto the grand total - mirrors pos.service.ts checkout() exactly. A slot with
  // no key is dropped (matches what's actually sent to checkout).
  const additionalExpensesTotal = state.additionalExpenses
    .filter((e) => e.key.trim())
    .reduce((sum, e) => sum + e.value, 0);

  const grandTotal = Math.max(0, finalSubtotal + taxAmount) + additionalExpensesTotal;
  const paid = state.payments.reduce((sum, p) => sum + p.amount, 0);
  const dueBeforeCredit = Math.max(0, grandTotal - paid);

  // Mirrors pos.service.ts checkout(): credit applied is capped by BOTH what's still due and what
  // the customer actually has available, never the client's raw requested amount.
  const availableCredit = state.customer && Number(state.customer.balance) < 0 ? -Number(state.customer.balance) : 0;
  const appliedCredit = Math.min(Math.max(0, state.appliedCreditAmount), dueBeforeCredit, availableCredit);

  return {
    itemCount: state.lines.length,
    quantityTotal,
    subtotal: roundMoney(subtotal),
    lineDiscountTotal: roundMoney(lineDiscountTotal),
    invoiceDiscountAmount: roundMoney(invoiceDiscountAmount),
    couponDiscountAmount: roundMoney(couponDiscountAmount),
    pointsDiscountAmount: roundMoney(pointsDiscountAmount),
    redeemedPoints,
    discountTotal: roundMoney(lineDiscountTotal + invoiceDiscountAmount + couponDiscountAmount + pointsDiscountAmount),
    taxAmount: roundMoney(taxAmount),
    shipping: roundMoney(state.shipping),
    additionalExpensesTotal: roundMoney(additionalExpensesTotal),
    grandTotal: roundMoney(grandTotal),
    paid: roundMoney(paid),
    availableCredit: roundMoney(availableCredit),
    appliedCredit: roundMoney(appliedCredit),
    due: roundMoney(Math.max(0, dueBeforeCredit - appliedCredit)),
  };
}

/**
 * Subscribe to derived totals. Wrapped in useShallow because selectTotals builds a fresh object
 * each call - without shallow comparison React/Zustand would re-render every tick and loop.
 * Defined after selectTotals so the reference is unambiguous under Fast Refresh.
 */
export const usePosTotals = () => usePosStore(useShallow(selectTotals));

/** The coupon's share of one cart line (0 when no coupon is on the cart or it skipped this line). */
export function useLineCouponShare(key: string) {
  return usePosStore((s) => (s.coupon ? s.coupon.lineDiscounts[s.lines.findIndex((l) => l.key === key)] ?? 0 : 0));
}
