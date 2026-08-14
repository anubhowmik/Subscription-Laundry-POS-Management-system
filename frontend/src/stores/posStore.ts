import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { calcLine } from "../lib/posCalc";

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
}

export interface PosCustomer {
  id: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
  balance: string;
  rewardPoints?: number;
  cashBack?: string;
}

export type DiscountMode = "PERCENT" | "FIXED";

export interface PosPayment {
  id: string;
  paymentMethodId: string;
  label: string;
  amount: number;
}

export interface AppliedCoupon {
  code: string;
  discountAmount: number; // computed server-side by the preview endpoint at apply time
}

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
  note: string;

  addItem: (item: Omit<PosLine, "key" | "quantity" | "discountAmount"> & { quantity?: number }) => void;
  incQty: (key: string) => void;
  decQty: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  setLineDiscount: (key: string, amount: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;

  setCustomer: (c: PosCustomer | null) => void;
  setInvoiceDiscount: (mode: DiscountMode, value: number) => void;
  setShipping: (amount: number) => void;
  setRedeemPoints: (points: number) => void;
  setAppliedCreditAmount: (amount: number) => void;
  setNote: (note: string) => void;
  setCoupon: (coupon: AppliedCoupon | null) => void;

  addPayment: (p: Omit<PosPayment, "id">) => void;
  removePayment: (id: string) => void;
  clearPayments: () => void;

  /** Replaces the cart with lines/customer resumed from a server-persisted held sale. */
  loadCart: (lines: PosLine[], customer: PosCustomer | null) => void;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

export const usePosStore = create<PosState>((set, get) => ({
  lines: [],
  customer: null,
  invoiceDiscountMode: "FIXED",
  invoiceDiscountValue: 0,
  shipping: 0,
  redeemPoints: 0,
  appliedCreditAmount: 0,
  payments: [],
  coupon: null,
  note: "",

  addItem: (item) =>
    set((state) => {
      const key = `${item.type}:${item.id}`;
      const existing = state.lines.find((l) => l.key === key);
      if (existing) {
        // Duplicate scan/click bumps quantity instead of adding a second row.
        return {
          lines: state.lines.map((l) =>
            l.key === key ? { ...l, quantity: l.quantity + (item.quantity ?? 1) } : l,
          ),
        };
      }
      const line: PosLine = { ...item, key, quantity: item.quantity ?? 1, discountAmount: 0 };
      return { lines: [...state.lines, line] };
    }),

  incQty: (key) =>
    set((state) => ({ lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)) })),

  decQty: (key) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l)),
    })),

  setQty: (key, qty) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.floor(qty) || 1) } : l)),
    })),

  setLineDiscount: (key, amount) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, discountAmount: Math.max(0, amount) } : l)),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

  clear: () =>
    set({ lines: [], payments: [], invoiceDiscountValue: 0, shipping: 0, redeemPoints: 0, appliedCreditAmount: 0, coupon: null, note: "" }),

  setCustomer: (customer) => set({ customer, redeemPoints: 0, appliedCreditAmount: 0 }),
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

  addPayment: (p) => set((state) => ({ payments: [...state.payments, { ...p, id: uid() }] })),
  removePayment: (id) => set((state) => ({ payments: state.payments.filter((p) => p.id !== id) })),
  clearPayments: () => set({ payments: [] }),

  loadCart: (lines, customer) =>
    set({ lines, customer, payments: [], invoiceDiscountValue: 0, shipping: 0, redeemPoints: 0, appliedCreditAmount: 0, coupon: null }),
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
  grandTotal: number;
  paid: number;
  availableCredit: number; // customer's total store credit on hand (from a negative balance)
  appliedCredit: number; // portion of availableCredit actually usable against this invoice's due
  due: number; // after cash/card/online payments AND applied store credit
}

/**
 * Pure totals from a snapshot of the store. Use usePosTotals() in components; getState() elsewhere.
 *
 * Mirrors pos.service.ts checkout() exactly: the coupon and invoice discount both net into the
 * taxable base sequentially (coupon first, then invoice discount off the coupon-adjusted base),
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

  for (const line of state.lines) {
    const t = calcLine(line);
    subtotal += t.subtotal;
    lineTaxAmount += t.taxAmount;
    lineDiscountTotal += line.discountAmount;
    quantityTotal += line.quantity;
  }

  const couponDiscountAmount = Math.min(state.coupon?.discountAmount ?? 0, subtotal);
  const subtotalAfterCoupon = subtotal - couponDiscountAmount;

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

  const grandTotal = Math.max(0, finalSubtotal + taxAmount);
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
