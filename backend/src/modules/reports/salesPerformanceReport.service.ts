import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { itemScopeWhere, parseAppScope, parseReportLocationQuery, productCategoryTree, resolveReportLocations } from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Sales Performance Report" (ReportController@getSalesPerformanceReport +
 * report/sales_performance_report.blade.php, Sales Reports dropdown): every main category that has
 * a yearly target, by name, with Target, Target MTD, Actual MTD, Variance MTD % (actual vs monthly
 * target), Sales MTM % (the month vs the same month of the comparison year), Target YTD (the yearly
 * target), Actual YTD, Variance YTD % and Sales YTY %, then a TOTAL row. Actual sales are the
 * reference's sell-line `quantity x unit_price` = SaleItem.subtotal, with sub-categories rolled up
 * to their main category. Filters: Location Group, Business Location, Year, Comparison Year, Month.
 *
 * Targets are set on the Categories page (reference: the taxonomy form's target / target_mtd).
 * Main categories here are top-level product categories plus service categories, since a laundry
 * item is a Service.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - The Year and Comparison Year filters work (the reference's script reads them as `input`
 *    elements while they're `select`s, so the server always falls back to this year vs last year).
 *  - "All" location groups reports every permitted branch (the reference returns an empty table
 *    unless a group is picked).
 *  - Percentages keep one decimal and amounts two (the reference rounds both to integers), and a
 *    percentage with no base is "-" rather than 0%.
 */

const yearMonths = (year: number, toMonth: number) => ({ gte: new Date(year, 0, 1), lte: new Date(year, toMonth, 0, 23, 59, 59, 999) });
const pct = (value: Decimal, base: Decimal | null) => (base && base.gt(0) ? value.sub(base).div(base).mul(100).toFixed(1) : null);

type Figures = { target: Decimal; targetMtd: Decimal; mtdCurr: Decimal; mtdPrev: Decimal; ytdCurr: Decimal; ytdPrev: Decimal };
const empty = (): Figures => ({ target: new Decimal(0), targetMtd: new Decimal(0), mtdCurr: new Decimal(0), mtdPrev: new Decimal(0), ytdCurr: new Decimal(0), ytdPrev: new Decimal(0) });
const format = (f: Figures) => ({
  target: f.target.toFixed(2),
  targetMtd: f.targetMtd.toFixed(2),
  actualMtd: f.mtdCurr.toFixed(2),
  varianceMtd: pct(f.mtdCurr, f.targetMtd),
  mtm: pct(f.mtdCurr, f.mtdPrev),
  targetYtd: f.target.toFixed(2),
  actualYtd: f.ytdCurr.toFixed(2),
  varianceYtd: pct(f.ytdCurr, f.target),
  yty: pct(f.ytdCurr, f.ytdPrev),
});

export async function salesPerformanceReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const now = new Date();
  const year = query.year ? Number(query.year) : now.getFullYear();
  const compareYear = query.compareYear ? Number(query.compareYear) : year - 1;
  const month = query.month ? Number(query.month) : now.getMonth() + 1;
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);

  const [productCategories, serviceCategories, items, tree] = await Promise.all([
    // Product categories belong to Product POS, service categories to Service POS.
    scope === "service" ? [] : prisma.category.findMany({ where: { organizationId, parentId: null, target: { gt: 0 } }, select: { id: true, nameEn: true, nameAr: true, target: true, targetMtd: true } }),
    scope === "product" ? [] : prisma.serviceCategory.findMany({ where: { organizationId, target: { gt: 0 } }, select: { id: true, nameEn: true, nameAr: true, target: true, targetMtd: true } }),
    prisma.saleItem.findMany({
      where: {
        ...itemScopeWhere(scope),
        sale: {
          organizationId,
          status: "FINAL",
          businessLocationId: { in: locations.map((l) => l.id) },
          OR: [{ saleDate: yearMonths(year, month) }, { saleDate: yearMonths(compareYear, month) }],
        },
      },
      select: { subtotal: true, product: { select: { categoryId: true } }, service: { select: { categoryId: true } }, sale: { select: { saleDate: true } } },
    }),
    productCategoryTree(organizationId),
  ]);

  // Reference: categories with a target, ordered by name.
  const categories = [
    ...productCategories.map((c) => ({ ...c, key: `pc:${c.id}` })),
    ...serviceCategories.map((c) => ({ ...c, key: `sc:${c.id}` })),
  ].sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  const figures = new Map(categories.map((c) => [c.key, { ...empty(), target: c.target ?? new Decimal(0), targetMtd: c.targetMtd ?? new Decimal(0) }]));

  for (const i of items) {
    const key = i.product?.categoryId ? `pc:${tree.topOf(i.product.categoryId)?.id ?? i.product.categoryId}` : i.service?.categoryId ? `sc:${i.service.categoryId}` : null;
    const f = key ? figures.get(key) : undefined;
    if (!f) continue;
    const d = i.sale.saleDate;
    const isMonth = d.getMonth() + 1 === month;
    if (d.getFullYear() === year) {
      f.ytdCurr = f.ytdCurr.add(i.subtotal);
      if (isMonth) f.mtdCurr = f.mtdCurr.add(i.subtotal);
    }
    if (d.getFullYear() === compareYear) {
      f.ytdPrev = f.ytdPrev.add(i.subtotal);
      if (isMonth) f.mtdPrev = f.mtdPrev.add(i.subtotal);
    }
  }

  const total = empty();
  const rows = categories.map((c) => {
    const f = figures.get(c.key)!;
    for (const k of Object.keys(total) as (keyof Figures)[]) total[k] = total[k].add(f[k]);
    return { key: c.key, nameEn: c.nameEn, nameAr: c.nameAr, ...format(f) };
  });

  return { year, compareYear, month, filters, rows, totals: format(total) };
}
