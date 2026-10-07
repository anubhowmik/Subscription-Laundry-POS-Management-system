import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, parseAppScope, localToday, parseReportLocationQuery, productCategoryTree, resolveReportLocations } from "./reportCommon";
import { sameDateLastYear } from "./dailySalesReport.service";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Weekly LFL Sales Report" and "Monthly LFL Sales Report" (ReportController@
 * getWeeklyLflSalesReport / getMonthlyLflSalesReport, Sales Reports dropdown): one row per main
 * category, and for every region (location group) the period's sales next to its LFL - like for
 * like, the same dates one year earlier - then Total Sales / Total LFL and a TOTAL row. Sales are
 * the reference's sell-line `quantity x unit_price` (after line discounts, before tax), i.e.
 * SaleItem.subtotal. Filters: Location Group, Business Location, Date Range.
 *
 * Week: a 7-day window starting on the picked date (default: this Monday to Sunday). Month: the
 * whole calendar month(s) covering the picked range (default: this month).
 *
 * Main categories are top-level product categories (sub-categories roll up, as the reference's
 * `category_id` is always top-level) plus service categories, since a laundry item is a Service
 * here. Deliberate deviations, each fixing a reference defect:
 *  - Amounts keep their decimals (the reference rounds every cell to whole riyals).
 *  - Sales at branches with no location group appear under a "No Group" region, and items with no
 *    category under "Uncategorized" (the reference's inner joins silently drop both, so its TOTAL
 *    row understates sales).
 */

export type LflPeriod = "week" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** The reference's window: a forced 7-day week, or whole calendar months. */
export function lflWindow(period: LflPeriod, from?: string, to?: string) {
  const today = parseYmd(localToday());
  if (period === "week") {
    // Carbon's startOfWeek(): Monday.
    const start = from ? parseYmd(from) : new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { startDate: toYmd(start), endDate: toYmd(end) };
  }
  const s = from ? parseYmd(from) : today;
  const e = to ? parseYmd(to) : from ? parseYmd(from) : today;
  return { startDate: toYmd(new Date(s.getFullYear(), s.getMonth(), 1)), endDate: toYmd(new Date(e.getFullYear(), e.getMonth() + 1, 0)) };
}

/** Last year's window: the same dates (week) or the same months (month). */
function previousWindow(period: LflPeriod, startDate: string, endDate: string) {
  if (period === "week") return { startDate: sameDateLastYear(startDate), endDate: sameDateLastYear(endDate) };
  const s = parseYmd(startDate);
  const e = parseYmd(endDate);
  return { startDate: toYmd(new Date(s.getFullYear() - 1, s.getMonth(), 1)), endDate: toYmd(new Date(e.getFullYear() - 1, e.getMonth() + 1, 0)) };
}

const range = (a: string, b: string) => ({ gte: new Date(`${a}T00:00:00`), lte: new Date(`${b}T23:59:59.999`) });

export async function lflSalesReport(period: LflPeriod, query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const { startDate, endDate } = lflWindow(period, q.from, q.to);
  const prev = previousWindow(period, startDate, endDate);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const locationIds = locations.map((l) => l.id);

  const [groups, locationGroups, items, tree, productCategories, serviceCategories] = await Promise.all([
    // Reference: every region is a column pair, ordered by id (creation order here).
    prisma.businessLocationGroup.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.businessLocation.findMany({ where: { id: { in: locationIds } }, select: { id: true, groupId: true } }),
    prisma.saleItem.findMany({
      where: {
        ...itemScopeWhere(scope),
        sale: {
          organizationId,
          status: "FINAL",
          businessLocationId: { in: locationIds },
          OR: [{ saleDate: range(startDate, endDate) }, { saleDate: range(prev.startDate, prev.endDate) }],
        },
      },
      select: {
        subtotal: true,
        product: { select: { categoryId: true } },
        service: { select: { categoryId: true } },
        sale: { select: { businessLocationId: true, saleDate: true } },
      },
    }),
    productCategoryTree(organizationId),
    scope === "service" ? [] : prisma.category.findMany({ where: { organizationId, parentId: null }, select: { id: true, nameEn: true, nameAr: true, code: true } }),
    scope === "product" ? [] : prisma.serviceCategory.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
  ]);

  const groupOfLocation = new Map(locationGroups.map((l) => [l.id, l.groupId ?? "none"]));
  const currentEnd = range(startDate, endDate).lte;
  const currentStart = range(startDate, endDate).gte;
  const cells = new Map<string, Map<string, { sales: Decimal; lfl: Decimal }>>(); // category -> region -> amounts
  let anyUngrouped = false;
  for (const i of items) {
    const isCurrent = i.sale.saleDate >= currentStart && i.sale.saleDate <= currentEnd;
    const region = groupOfLocation.get(i.sale.businessLocationId) ?? "none";
    if (region === "none") anyUngrouped = true;
    const categoryKey = i.product
      ? i.product.categoryId
        ? `pc:${tree.topOf(i.product.categoryId)?.id ?? i.product.categoryId}`
        : "none"
      : i.service?.categoryId
        ? `sc:${i.service.categoryId}`
        : "none";
    const byRegion = cells.get(categoryKey) ?? new Map();
    const c = byRegion.get(region) ?? { sales: new Decimal(0), lfl: new Decimal(0) };
    if (isCurrent) c.sales = c.sales.add(i.subtotal);
    else c.lfl = c.lfl.add(i.subtotal);
    byRegion.set(region, c);
    cells.set(categoryKey, byRegion);
  }

  const regions = [...groups.map((g) => ({ key: g.id, nameEn: g.nameEn, nameAr: g.nameAr })), ...(anyUngrouped ? [{ key: "none", nameEn: "No Group", nameAr: "بدون مجموعة" }] : [])];
  const categoryOrder = [
    ...productCategories
      .sort((a, b) => (Number(a.code) || Infinity) - (Number(b.code) || Infinity) || a.nameEn.localeCompare(b.nameEn))
      .map((c) => ({ key: `pc:${c.id}`, nameEn: c.code ? `${c.nameEn}-${c.code}` : c.nameEn, nameAr: c.code ? `${c.nameAr}-${c.code}` : c.nameAr })),
    ...serviceCategories.map((c) => ({ key: `sc:${c.id}`, nameEn: c.nameEn, nameAr: c.nameAr })),
    { key: "none", nameEn: "Uncategorized", nameAr: "بدون فئة" },
  ];

  const zero = () => ({ sales: new Decimal(0), lfl: new Decimal(0) });
  const regionTotals = new Map(regions.map((r) => [r.key, zero()]));
  const grand = zero();
  const fmt = (c: { sales: Decimal; lfl: Decimal }) => ({ sales: c.sales.toFixed(2), lfl: c.lfl.toFixed(2) });
  const rows = categoryOrder
    .filter((c) => cells.has(c.key))
    .map((c) => {
      const byRegion = cells.get(c.key)!;
      const total = zero();
      const out: Record<string, { sales: string; lfl: string }> = {};
      for (const r of regions) {
        const v = byRegion.get(r.key) ?? zero();
        out[r.key] = fmt(v);
        total.sales = total.sales.add(v.sales);
        total.lfl = total.lfl.add(v.lfl);
        const t = regionTotals.get(r.key)!;
        t.sales = t.sales.add(v.sales);
        t.lfl = t.lfl.add(v.lfl);
      }
      grand.sales = grand.sales.add(total.sales);
      grand.lfl = grand.lfl.add(total.lfl);
      return { key: c.key, nameEn: c.nameEn, nameAr: c.nameAr, regions: out, total: fmt(total) };
    });

  return {
    period,
    startDate,
    endDate,
    previousStartDate: prev.startDate,
    previousEndDate: prev.endDate,
    filters,
    regions,
    rows,
    totals: { regions: Object.fromEntries([...regionTotals].map(([k, v]) => [k, fmt(v)])), total: fmt(grand) },
  };
}
