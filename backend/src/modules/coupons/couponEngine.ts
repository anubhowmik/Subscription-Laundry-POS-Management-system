import { Prisma, type Coupon } from "@prisma/client";

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;

/**
 * Coupon rules, translated from the EJADA reference - TransactionUtil::checkactiveCoupon (is it
 * usable right now), ::checkCoupon + fetchMainData + check_basic_conditions (does it fit this
 * cart), SellPosController@applyCoupon (usage limits) and pos.js applyCouponSuccess (how the
 * discount lands on the lines).
 *
 * The discount is a line discount on the matching lines (the reference writes it into each row's
 * line discount and stamps the row's coupon_id), not an invoice-level amount: percentage = that
 * share of each matching line, fixed = the amount spread over the matching lines by value.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Ends At is checked even without a Starts At (the reference only looked at the window when
 *    starts_at was set, so an end-only coupon never expired).
 *  - A fixed coupon is spread over the matching lines' own total (the reference divided by the
 *    whole cart, so on a product-limited coupon only part of the amount was ever given).
 *  - Max Discount compares against the matching lines' discount (the reference compared the whole
 *    invoice total x percentage even when only some lines got the percentage).
 *  - With Added Discount on, the coupon is taken off what is left of each line after its own
 *    promotion / line discount; the reference overwrote that line discount, so a promoted line
 *    lost its promotion while still being marked as promoted.
 */

export const COUPON_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type CouponDay = (typeof COUPON_DAYS)[number];

export interface CouponPeriod {
  from: string; // "HH:mm"
  to: string;
}

export function couponPeriods(value: Prisma.JsonValue | null | undefined): CouponPeriod[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is { from: string; to: string } => typeof p === "object" && p !== null && typeof (p as { from?: unknown }).from === "string" && typeof (p as { to?: unknown }).to === "string")
    .filter((p) => p.from && p.to)
    .map((p) => ({ from: p.from, to: p.to }));
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Shop-local calendar day ("YYYY-MM-DD"); the process runs in the shop's timezone. */
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A @db.Date column comes back as UTC midnight of that calendar day. */
const dateColumnDay = (d: Date) => d.toISOString().slice(0, 10);

/** Reference checkactiveCoupon(): null when the coupon can be used right now, else why not. */
export function couponInactiveReason(coupon: Pick<Coupon, "isActive" | "deletedAt" | "validFrom" | "validUntil" | "days" | "periods">, now = new Date()): string | null {
  if (!coupon.isActive || coupon.deletedAt) return "Coupon code invalid";
  const today = localDay(now);
  if (coupon.validFrom && today < dateColumnDay(coupon.validFrom)) return "This coupon is not active yet";
  if (coupon.validUntil && today > dateColumnDay(coupon.validUntil)) return "This coupon has expired";
  if (coupon.days.length > 0 && !coupon.days.includes(COUPON_DAYS[now.getDay()])) return "This coupon can't be used today";
  const periods = couponPeriods(coupon.periods);
  if (periods.length > 0) {
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    // Reference: a window may run past midnight (from 22:00 to 02:00).
    const inside = periods.some((p) => (p.from <= p.to ? time >= p.from && time <= p.to : time >= p.from || time <= p.to));
    if (!inside) return "This coupon can't be used at this time";
  }
  return null;
}

/** The facts about a cart line the coupon conditions look at (built like the promotion engine's lines). */
export interface CouponLine {
  key: string; // "p:<productId>" | "s:<serviceId>"
  categoryKey: string | null; // "pc:<main category>" | "sc:<service category>"
  brandId: string | null;
  /** What the line is worth before the coupon - its price less its own promotion / line discount. */
  base: Dec;
  /** The line's total incl. tax before the coupon (reference pos_line_total, for Sales Amount). */
  total: Dec;
}

/** Reference fetchMainData(): products picked directly, by category or by brand - empty = every line. */
export function couponTargetsItems(coupon: Pick<Coupon, "itemKeys" | "categoryKeys" | "brandIds">) {
  return coupon.itemKeys.length > 0 || coupon.categoryKeys.length > 0 || coupon.brandIds.length > 0;
}

export function couponLineMatches(coupon: Pick<Coupon, "itemKeys" | "categoryKeys" | "brandIds">, line: Pick<CouponLine, "key" | "categoryKey" | "brandId">) {
  if (!couponTargetsItems(coupon)) return true;
  return (
    coupon.itemKeys.includes(line.key) ||
    (line.categoryKey != null && coupon.categoryKeys.includes(line.categoryKey)) ||
    (line.brandId != null && coupon.brandIds.includes(line.brandId))
  );
}

export type CouponFit = { ok: true; discounts: Dec[] } | { ok: false; reason: string };

/**
 * Reference checkCoupon() Sales Amount rule + applyCouponSuccess(): which lines get the coupon and
 * how much each line is discounted. `discounts[i]` lines up with `lines[i]` (0 for lines it skips).
 */
export function fitCoupon(
  coupon: Pick<Coupon, "itemKeys" | "categoryKeys" | "brandIds" | "minPurchaseAmount" | "discountMode" | "discountValue" | "maxDiscountAmount">,
  lines: CouponLine[],
): CouponFit {
  const matched = lines.map((l) => couponLineMatches(coupon, l));
  const targets = couponTargetsItems(coupon);
  if (targets && !matched.some(Boolean)) return { ok: false, reason: "Conditions do not match" };
  // Sales Amount: the matching products' total when the coupon targets products, else the cart's.
  const salesBase = lines.reduce((s, l, i) => (targets && !matched[i] ? s : s.add(l.total)), new Decimal(0));
  if (salesBase.lt(coupon.minPurchaseAmount)) {
    return { ok: false, reason: `This coupon requires a minimum purchase of ${coupon.minPurchaseAmount.toFixed(2)}` };
  }

  const bases = lines.map((l, i) => (matched[i] ? Decimal.max(l.base, 0) : new Decimal(0)));
  const pool = bases.reduce((s, b) => s.add(b), new Decimal(0));
  if (pool.lte(0)) return { ok: true, discounts: lines.map(() => new Decimal(0)) };

  let fixedAmount: Dec | null = null;
  if (coupon.discountMode === "PERCENT") {
    const pct = Decimal.min(coupon.discountValue, 100);
    const total = pool.mul(pct).div(100);
    // Max Discount turns an over-the-cap percentage into a fixed amount (reference applyCouponSuccess).
    if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount.gt(0) && total.gt(coupon.maxDiscountAmount)) {
      fixedAmount = coupon.maxDiscountAmount;
    } else {
      return { ok: true, discounts: bases.map((b) => b.mul(pct).div(100).toDecimalPlaces(2)) };
    }
  } else {
    fixedAmount = coupon.discountValue;
  }

  // Fixed: spread over the matching lines by value; the last one takes the rounding remainder.
  const amount = Decimal.min(fixedAmount, pool).toDecimalPlaces(2);
  const discounts = bases.map(() => new Decimal(0));
  const lastIndex = bases.reduce((last, b, i) => (b.gt(0) ? i : last), -1);
  let given = new Decimal(0);
  bases.forEach((b, i) => {
    if (b.lte(0)) return;
    const share = i === lastIndex ? amount.sub(given) : amount.mul(b).div(pool).toDecimalPlaces(2);
    discounts[i] = Decimal.min(share, b);
    given = given.add(discounts[i]);
  });
  return { ok: true, discounts };
}
