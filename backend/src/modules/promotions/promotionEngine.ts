import { Prisma, type Promotion, type PromotionLine } from "@prisma/client";
import { AppError } from "../../utils/AppError";

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;

/**
 * Server-side translation of the EJADA reference's promotion engine: TransactionUtil's
 * checkActivePromotion() / checkPromotion() / check_multiple_promotion() decide whether a
 * promotion applies, and pos.js's `#apply_promotion` handler + applyPromotion() then split cart
 * rows and set each promoted row's line discount. Here both halves run on the server, inside
 * checkout(), so a cashier can never send a promotion discount the rules don't allow; the POS
 * preview endpoint runs the exact same function.
 *
 * Deliberate departures from the reference, which had genuine bugs here:
 *   - Periods (From/To time) are enforced. The reference computed them and then left the check
 *     commented out, so a promotion limited to 4pm-8pm applied all day.
 *   - "Exclude Category" excludes the lines in those categories. The reference compared the
 *     excluded category ids against the POS's customer-group id, so it never matched anything.
 *   - Excluded items are never discounted. The reference only dropped them from the eligibility
 *     count, then discounted every cart row anyway when the promotion had no item condition.
 *   - Quantity rules count every eligible piece in the cart. The reference counted the matched
 *     products together, but with no item condition it required a single row to reach the
 *     quantity on its own (2 thobes + 2 shirts did not reach "buy 3").
 *   - "All products required" checks the promotion's explicitly picked items. The reference
 *     checked the category-expanded list, which can never all be on one invoice.
 *   - A Cash back promotion honours its item conditions. The reference ignored them.
 */

export interface EngineLine {
  key: string; // "p:<productId>" | "s:<serviceId>"
  categoryKey: string | null; // "pc:<top-level category>" | "sc:<service category>"
  brandId: string | null;
  pieces: Dec; // the entered quantity (pieces), before any width x height area scaling
  perPiecePrice: Dec; // unit price x area factor - what one piece is charged before discount
  amount: Dec; // the line's total incl. tax after its own manual discount (reference pos_line_total)
}

export interface EngineContext {
  businessLocationId: string;
  businessLocationGroupId: string | null;
  // inCustomerGroup: the customer belongs to a real customer group (a company account). This app
  // files the Walk-in customer under its own "Walk-in Customer" group, which doesn't count - the
  // reference's walk-in contact has no group, and "Exclude Customer Group" (استبعاد عملاء الشركات,
  // "exclude company customers") must not switch every promotion off for walk-in sales.
  customer: { id: string; customerGroupId: string | null; priceListId: string | null; inCustomerGroup: boolean };
  now: Date;
}

export type PromotionWithLines = Promotion & { lines: PromotionLine[] };

/** One output row: `pieces` of the source cart line, with its promotion discount (if any). */
export interface PromotionSegment {
  sourceIndex: number;
  pieces: Dec;
  discountAmount: Dec | null; // null = keep the source line's own manual discount (prorated)
  promoted: boolean;
  free: boolean; // a Bonus row added on top of the cart (not split from an existing row)
}

export interface PromotionResult {
  applied: boolean;
  segments: PromotionSegment[];
}

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZERO = new Decimal(0);

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// @db.Date columns come back as UTC midnight of the stored calendar day.
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Reference checkActivePromotion(): active flag, date range, week days and time periods. */
export function isPromotionActiveNow(promo: Pick<Promotion, "isActive" | "deletedAt" | "startsAt" | "endsAt" | "days" | "periods">, now: Date) {
  if (!promo.isActive || promo.deletedAt) return false;
  const today = ymd(now);
  if (promo.startsAt && today < dateOnly(promo.startsAt)) return false;
  if (promo.endsAt && today > dateOnly(promo.endsAt)) return false;
  if (promo.days.length > 0 && !promo.days.includes(DAY_KEYS[now.getDay()])) return false;
  const periods = Array.isArray(promo.periods) ? (promo.periods as { from?: string; to?: string }[]).filter((p) => p?.from && p?.to) : [];
  if (periods.length > 0) {
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const inside = periods.some(({ from, to }) => (from! <= to! ? t >= from! && t <= to! : t >= from! || t <= to!));
    if (!inside) return false;
  }
  return true;
}

/** Reference check_basic_conditions() + exclude_customer_group: branch and customer targeting. */
export function passesBasicConditions(promo: Promotion, ctx: EngineContext) {
  const { customer } = ctx;
  if (promo.excludeCustomerGroup && customer.inCustomerGroup) return false;
  if (promo.excludeCustomerIds.includes(customer.id)) return false;
  if (promo.excludeBusinessLocationIds.includes(ctx.businessLocationId)) return false;

  const restrictsLocation = promo.businessLocationIds.length > 0 || promo.locationGroupIds.length > 0;
  if (
    restrictsLocation &&
    !promo.businessLocationIds.includes(ctx.businessLocationId) &&
    !(ctx.businessLocationGroupId && promo.locationGroupIds.includes(ctx.businessLocationGroupId))
  ) {
    return false;
  }

  const restrictsCustomer = promo.customerIds.length > 0 || promo.customerGroupIds.length > 0 || promo.priceListIds.length > 0;
  if (
    restrictsCustomer &&
    !promo.customerIds.includes(customer.id) &&
    !(customer.customerGroupId && promo.customerGroupIds.includes(customer.customerGroupId)) &&
    !(customer.priceListId && promo.priceListIds.includes(customer.priceListId))
  ) {
    return false;
  }
  return true;
}

const hasItemCondition = (p: Promotion) => p.itemKeys.length > 0 || p.categoryKeys.length > 0 || p.brandIds.length > 0;

function matchesItemCondition(p: Promotion, line: EngineLine) {
  return (
    p.itemKeys.includes(line.key) ||
    (line.categoryKey != null && p.categoryKeys.includes(line.categoryKey)) ||
    (line.brandId != null && p.brandIds.includes(line.brandId))
  );
}

function isExcluded(p: Promotion, line: EngineLine) {
  return p.excludeItemKeys.includes(line.key) || (line.categoryKey != null && p.excludeCategoryKeys.includes(line.categoryKey));
}

const sum = (xs: Dec[]) => xs.reduce((a, b) => a.add(b), ZERO);

type Discount = { kind: "PERCENT"; value: Dec } | { kind: "PER_PIECE"; value: Dec } | { kind: "LINE_AMOUNT"; value: Dec };

function discountFor(line: EngineLine, pieces: Dec, d: Discount): Dec {
  const gross = line.perPiecePrice.mul(pieces);
  let amount: Dec;
  if (d.kind === "PERCENT") amount = gross.mul(Decimal.min(d.value, 100)).div(100);
  else if (d.kind === "PER_PIECE") amount = Decimal.min(d.value, line.perPiecePrice).mul(pieces);
  else amount = d.value;
  return Decimal.max(ZERO, Decimal.min(amount, gross)).toDecimalPlaces(2);
}

function promoDiscount(p: Promotion): Discount {
  const value = p.discountAmount ?? ZERO;
  return p.discountType === "FIXED" ? { kind: "PER_PIECE", value } : { kind: "PERCENT", value };
}

/**
 * Walks `targets` cheapest piece first and promotes up to `pieces` of them - pos.js sorts the
 * matched rows by unit price ascending and splits the row where the promoted quantity runs out.
 */
function allocateCheapestFirst(lines: EngineLine[], targets: number[], pieces: Dec, d: Discount, alloc: Map<number, { pieces: Dec; d: Discount }[]>) {
  let remaining = pieces;
  const order = [...targets].sort((a, b) => lines[a].perPiecePrice.cmp(lines[b].perPiecePrice));
  for (const i of order) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(lines[i].pieces, remaining);
    if (take.lte(0)) continue;
    const list = alloc.get(i) ?? [];
    list.push({ pieces: take, d });
    alloc.set(i, list);
    remaining = remaining.sub(take);
  }
}

/**
 * Reference checkPromotion() (eligibility) + pos.js's per-type row handling (what gets
 * discounted). Returns `applied: false` when the conditions don't match.
 */
export function evaluatePromotion(promo: PromotionWithLines, lines: EngineLine[], ctx: EngineContext): PromotionResult {
  const none: PromotionResult = { applied: false, segments: [] };
  if (!isPromotionActiveNow(promo, ctx.now) || !passesBasicConditions(promo, ctx)) return none;

  const indexes = lines.map((_, i) => i);
  const eligible = indexes.filter((i) => !isExcluded(promo, lines[i]));
  const itemCond = hasItemCondition(promo);
  const matched = itemCond ? eligible.filter((i) => matchesItemCondition(promo, lines[i])) : eligible;
  const matchedPieces = sum(matched.map((i) => lines[i].pieces));
  const matchedAmount = sum(matched.map((i) => lines[i].amount));
  const cartAmount = sum(lines.map((l) => l.amount));

  if (promo.applyIfAllProductsExist && promo.itemKeys.length > 0) {
    const inCart = new Set(lines.map((l) => l.key));
    if (!promo.itemKeys.every((k) => inCart.has(k))) return none;
  }

  const alloc = new Map<number, { pieces: Dec; d: Discount }[]>();
  const extras: PromotionSegment[] = [];

  switch (promo.type) {
    case "CASH_BACK": {
      // No line discount - the cashback is granted on the final total at checkout.
      if (itemCond && matched.length === 0) return none;
      break;
    }
    case "TRADITIONAL_DISCOUNT":
    case "PRICE_DISCOUNT": {
      if (matched.length === 0) return none;
      if (promo.type === "PRICE_DISCOUNT") {
        const threshold = promo.salesAmount ?? ZERO;
        if ((itemCond ? matchedAmount : cartAmount).lt(threshold)) return none;
      }
      const d = promoDiscount(promo);
      if (d.kind === "PERCENT") {
        for (const i of matched) alloc.set(i, [{ pieces: lines[i].pieces, d }]);
      } else {
        // pos.js spreads a fixed discount over the targeted rows in proportion to each row's
        // pre-tax value (unit price x quantity).
        const grosses = matched.map((i) => lines[i].perPiecePrice.mul(lines[i].pieces));
        const totalGross = sum(grosses);
        const total = Decimal.min(d.value, totalGross);
        let given = ZERO;
        matched.forEach((i, n) => {
          const share =
            n === matched.length - 1 ? total.sub(given) : totalGross.gt(0) ? total.mul(grosses[n]).div(totalGross).toDecimalPlaces(2) : ZERO;
          given = given.add(share);
          alloc.set(i, [{ pieces: lines[i].pieces, d: { kind: "LINE_AMOUNT", value: share } }]);
        });
      }
      break;
    }
    case "QUANTITY_DISCOUNT": {
      const per = new Decimal(promo.salesQuantity ?? 0);
      if (per.lte(0) || matchedPieces.lt(per)) return none;
      const times = matchedPieces.div(per).floor();
      const promoPieces = new Decimal(promo.daQuantity ?? 0).mul(times);
      allocateCheapestFirst(lines, matched, promoPieces, promoDiscount(promo), alloc);
      break;
    }
    case "BOUNCE": {
      const per = new Decimal(promo.salesQuantity ?? 0);
      if (per.lte(0) || matchedPieces.lt(per) || matched.length === 0) return none;
      const bonus = new Decimal(promo.bounceQuantity ?? 0).mul(matchedPieces.div(per).floor());
      if (bonus.gt(0)) {
        // pos.js adds the bonus pieces as a new 100%-discounted row of the cheapest matched item.
        const cheapest = [...matched].sort((a, b) => lines[a].perPiecePrice.cmp(lines[b].perPiecePrice))[0];
        extras.push({
          sourceIndex: cheapest,
          pieces: bonus,
          discountAmount: lines[cheapest].perPiecePrice.mul(bonus).toDecimalPlaces(2),
          promoted: true,
          free: true,
        });
      }
      break;
    }
    case "PRODUCT_GIFTS": {
      if (matched.length === 0) return none;
      if (promo.salesQuantity != null) {
        if (matchedPieces.lt(promo.salesQuantity)) return none;
      } else if ((itemCond ? matchedAmount : cartAmount).lt(promo.salesAmount ?? ZERO)) {
        return none;
      }
      const gifts = eligible.filter((i) => promo.giftItemKeys.includes(lines[i].key));
      allocateCheapestFirst(lines, gifts, new Decimal(promo.giftQuantity ?? 0), { kind: "PERCENT", value: new Decimal(100) }, alloc);
      break;
    }
    case "MULTIPLE_DISCOUNT": {
      // Reference check_multiple_promotion(): each rule is "buy `quantity` of X, get
      // `giftQuantity` of Y at `discountPercent`% off", rules read largest quantity first and
      // each bought item used by one rule only.
      const rules = [...promo.lines].sort((a, b) => b.quantity.cmp(a.quantity));
      const used = new Set<string>();
      let anyMatch = false;
      for (const rule of rules) {
        if (used.has(rule.itemKey)) continue;
        const buyPieces = sum(eligible.filter((i) => lines[i].key === rule.itemKey).map((i) => lines[i].pieces));
        if (rule.quantity.lte(0) || buyPieces.lt(rule.quantity)) continue;
        anyMatch = true;
        used.add(rule.itemKey);
        let times = buyPieces.div(rule.quantity).floor();
        let giftPieces: Dec;
        const giftLines = eligible.filter((i) => lines[i].key === rule.giftItemKey);
        if (rule.giftItemKey !== rule.itemKey) {
          giftPieces = Decimal.min(sum(giftLines.map((i) => lines[i].pieces)), rule.giftQuantity.mul(times));
        } else {
          // Same item: the gift pieces must come on top of the pieces that earned them.
          let leftover = buyPieces.sub(rule.quantity.mul(times));
          if (leftover.eq(0) && !times.eq(1)) {
            times = times.sub(1);
            leftover = buyPieces.sub(rule.quantity.mul(times));
          }
          giftPieces = Decimal.min(leftover, rule.giftQuantity.mul(times));
        }
        if (giftPieces.gt(0)) {
          allocateCheapestFirst(lines, giftLines, giftPieces, { kind: "PERCENT", value: rule.discountPercent }, alloc);
        }
      }
      if (!anyMatch) return none;
      break;
    }
  }

  const segments: PromotionSegment[] = [];
  lines.forEach((line, i) => {
    const parts = alloc.get(i) ?? [];
    const promotedPieces = Decimal.min(sum(parts.map((p) => p.pieces)), line.pieces);
    const rest = line.pieces.sub(promotedPieces);
    if (rest.gt(0)) segments.push({ sourceIndex: i, pieces: rest, discountAmount: null, promoted: false, free: false });
    for (const part of parts) {
      segments.push({ sourceIndex: i, pieces: part.pieces, discountAmount: discountFor(line, part.pieces, part.d), promoted: true, free: false });
    }
  });
  segments.push(...extras);
  return { applied: true, segments };
}

/** Reference getActivePromotions(): active ones, highest priority first (no priority last). */
export function sortByPriority<T extends { priority: number | null; createdAt: Date }>(promos: T[]) {
  return [...promos].sort((a, b) => {
    if (a.priority !== b.priority) {
      if (a.priority == null) return 1;
      if (b.priority == null) return -1;
      return b.priority - a.priority;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function promotionNotApplicable(): never {
  throw new AppError(400, "Conditions do not match");
}
