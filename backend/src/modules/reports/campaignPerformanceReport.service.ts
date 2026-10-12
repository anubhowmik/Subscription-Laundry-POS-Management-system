import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  localToday,
  locationFiltersText,
  parseAppScope,
  parseReportLocationQuery,
  pickName,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";
import { branchDirectory, loadCustomerLines, type CustomerLine } from "./crmCommon";

const { Decimal } = Prisma;
type Dec = Prisma.Decimal;

/**
 * Reference: CRM Reports > Campaign Performance Report (ReportController@getCampaignPerformanceReport
 * + report/campaign_performance_report.blade.php). For one promotion (required), one row per
 * branch that sold with it: Region, Store, New Customers, Existing Customers, Transactions, Units,
 * Basket Size, Sales, then Week 1-5 sales each with its LFL% (vs the same promotion's sales on the
 * same days a year earlier). Filters: Promotion, Business Location, Location Group, Date Range -
 * which defaults to the promotion's own Starts At / Ends At, as in the reference.
 *
 * Sales are the promoted invoices' lines (reference quantity x unit_price: after the line discount,
 * before tax). A customer is "new" when registered on or after the range start.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - New / Existing Customers count customers. The reference summed a 1 per joined sell line, so
 *    a single customer buying 3 items counted as 3.
 *  - Week 1-5 are the range's calendar weeks in order (Week 1 = the Monday-Sunday week holding the
 *    range start, clipped to the range). The reference took the first five week-of-year groups that
 *    happened to have sales, in no fixed order - so "Week 1" could be any week and gaps shifted
 *    later weeks left - while its headers showed calendar week dates.
 *  - LFL compares the same days one year earlier; the reference matched week-of-year numbers,
 *    which drift by a day or two between years.
 *  - The promotion is the invoice's promotion, so a Cash back promotion (which discounts no line)
 *    reports too; the reference looked only at sell lines' promotion_id.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (s: string) => new Date(`${s}T00:00:00`);
const dayEnd = (s: string) => new Date(`${s}T23:59:59.999`);
const yearBack = (d: Date) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() - 1);
  return x;
};

/** The range's Monday-Sunday weeks (at most 5), each clipped to the range. */
export function campaignWeeks(startDate: string, endDate: string) {
  const from = dayStart(startDate);
  const to = dayEnd(endDate);
  const monday = new Date(from);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks: { index: number; start: Date; end: Date; startDate: string; endDate: string; label: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const ws = new Date(monday);
    ws.setDate(ws.getDate() + 7 * i);
    if (ws > to) break;
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    we.setHours(23, 59, 59, 999);
    const start = ws < from ? from : ws;
    const end = we > to ? to : we;
    weeks.push({ index: i + 1, start, end, startDate: ymd(start), endDate: ymd(end), label: `${pad(start.getDate())}/${pad(start.getMonth() + 1)} - ${pad(end.getDate())}/${pad(end.getMonth() + 1)}` });
  }
  return weeks;
}

const lfl = (cur: Dec, prev: Dec) => (prev.gt(0) ? cur.sub(prev).div(prev).mul(100).toDecimalPlaces(2).toFixed(2) : null);

type CampaignSource = { kind: "promotion"; id?: string } | { kind: "coupon"; id?: string };

async function campaignSource(source: CampaignSource, organizationId: string) {
  if (!source.id) return null;
  if (source.kind === "promotion") {
    const p = await prisma.promotion.findFirst({ where: { id: source.id, organizationId }, select: { id: true, name: true, startsAt: true, endsAt: true } });
    // @db.Date columns come back as UTC midnight.
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
    return p ? { id: p.id, name: p.name, startDate: day(p.startsAt), endDate: day(p.endsAt) } : null;
  }
  const c = await prisma.coupon.findFirst({ where: { id: source.id, organizationId }, select: { id: true, code: true, validFrom: true, validUntil: true } });
  return c ? { id: c.id, name: c.code, startDate: c.validFrom ? ymd(c.validFrom) : undefined, endDate: c.validUntil ? ymd(c.validUntil) : undefined } : null;
}

/** Shared by Campaign Performance (one promotion) and Discount Coupon (one coupon) - the reference's two reports are the same query keyed on promotion_id / coupon_id. */
async function campaignReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null, source: CampaignSource) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const picked = await campaignSource(source, organizationId);
  // Reference: the picked range, else the promotion's / coupon's own window.
  const startDate = q.from ?? picked?.startDate ?? localToday();
  const endDate = q.to ?? picked?.endDate ?? localToday();
  const weeks = campaignWeeks(startDate, endDate);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const promotion = picked && source.kind === "promotion" ? { id: picked.id, name: picked.name } : null;
  const coupon = picked && source.kind === "coupon" ? { id: picked.id, code: picked.name } : null;
  const empty = { startDate, endDate, promotion, coupon, weeks: weeks.map(({ index, startDate, endDate, label }) => ({ index, startDate, endDate, label })), filters };
  if (!picked) {
    return { ...empty, rows: [], totals: null, needsPromotion: source.kind === "promotion", needsCoupon: source.kind === "coupon" };
  }

  const base = { organizationId, locationIds: locations.map((l) => l.id), scope, ...(source.kind === "promotion" ? { promotionId: picked.id } : { couponId: picked.id }) };
  const [lines, lastYear, branches] = await Promise.all([
    loadCustomerLines({ ...base, from: dayStart(startDate), to: dayEnd(endDate) }),
    loadCustomerLines({ ...base, from: yearBack(dayStart(startDate)), to: yearBack(dayEnd(endDate)) }),
    branchDirectory(organizationId),
  ]);
  const rangeStart = dayStart(startDate);
  const weekOf = (d: Date) => weeks.findIndex((w) => d >= w.start && d <= w.end);
  const weekOfLastYear = (d: Date) => weeks.findIndex((w) => d >= yearBack(w.start) && d <= yearBack(w.end));

  interface Acc {
    sales: Set<string>;
    customers: Map<string, boolean>; // customer -> is new
    companies: Set<string>;
    units: Dec;
    amount: Dec;
    weeks: Dec[];
    prevWeeks: Dec[];
  }
  const fresh = (): Acc => ({ sales: new Set(), customers: new Map(), companies: new Set(), units: new Decimal(0), amount: new Decimal(0), weeks: weeks.map(() => new Decimal(0)), prevWeeks: weeks.map(() => new Decimal(0)) });
  const byStore = new Map<string, Acc>();
  const all = fresh();
  const add = (acc: Acc, line: CustomerLine) => {
    acc.sales.add(line.saleId);
    acc.customers.set(line.sale.customer.id, line.sale.customer.createdAt >= rangeStart);
    if (line.sale.customer.businessName) acc.companies.add(line.sale.customer.businessName);
    acc.units = acc.units.add(line.quantity);
    acc.amount = acc.amount.add(line.subtotal);
    const w = weekOf(line.sale.saleDate);
    if (w >= 0) acc.weeks[w] = acc.weeks[w].add(line.subtotal);
  };
  for (const line of lines) {
    const acc = byStore.get(line.sale.businessLocationId) ?? fresh();
    add(acc, line);
    add(all, line);
    byStore.set(line.sale.businessLocationId, acc);
  }
  for (const line of lastYear) {
    const w = weekOfLastYear(line.sale.saleDate);
    if (w < 0) continue;
    const acc = byStore.get(line.sale.businessLocationId);
    if (acc) acc.prevWeeks[w] = acc.prevWeeks[w].add(line.subtotal);
    all.prevWeeks[w] = all.prevWeeks[w].add(line.subtotal);
  }

  const figures = (acc: Acc) => {
    const transactions = acc.sales.size;
    const newCustomers = [...acc.customers.values()].filter(Boolean).length;
    return {
      newCustomers,
      existingCustomers: acc.customers.size - newCustomers,
      transactions,
      companyName: [...acc.companies].sort().join(", ") || "-",
      units: acc.units.toDecimalPlaces(3).toString(),
      basketSize: transactions > 0 ? acc.units.div(transactions).toDecimalPlaces(2).toFixed(2) : "0.00",
      sales: acc.amount.toFixed(2),
      weeks: acc.weeks.map((s, i) => ({ sales: s.toFixed(2), lastYear: acc.prevWeeks[i].toFixed(2), lfl: lfl(s, acc.prevWeeks[i]) })),
    };
  };
  const rows = [...byStore.entries()]
    .map(([locationId, acc]) => {
      const b = branches.get(locationId);
      return {
        locationId,
        region: b?.group ?? null,
        store: { branchName: b?.branchName ?? "", branchNameAr: b?.branchNameAr ?? null, branchCode: b?.branchCode ?? "" },
        ...figures(acc),
      };
    })
    .sort((a, b) => (a.region?.nameEn ?? "~").localeCompare(b.region?.nameEn ?? "~") || a.store.branchCode.localeCompare(b.store.branchCode));

  return { ...empty, rows, totals: figures(all), needsPromotion: false, needsCoupon: false };
}

export function campaignPerformanceReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  return campaignReport(query, organizationId, allowedLocationIds, { kind: "promotion", id: query.promotionId ? String(query.promotionId) : undefined });
}

/**
 * Reference: CRM Reports > Discount Coupon Report (ReportController@getDiscountCouponReport +
 * report/discount_coupon_report.blade.php) - the Campaign Performance layout for one coupon
 * (required), plus Promocode and Company Name columns. Filters: Coupon, Business Location,
 * Location Group, Date Range (defaults to the coupon's Valid From / Valid Until).
 *
 * Besides the Campaign Performance fixes above:
 *  - Company Name lists the business names of the branch's coupon customers; the reference
 *    computed MAX(supplier_business_name) and then printed a hard-coded "-".
 *  - Business Location / Location Group filter the rows; the reference sent both but its
 *    queries never used them.
 */
export function discountCouponReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  return campaignReport(query, organizationId, allowedLocationIds, { kind: "coupon", id: query.couponId ? String(query.couponId) : undefined });
}

async function campaignXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null, kind: "promotion" | "coupon") {
  const report = kind === "promotion" ? await campaignPerformanceReport(query, organizationId, allowedLocationIds) : await discountCouponReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const isCoupon = kind === "coupon";
  const title = isCoupon ? (isAr ? "تقرير اكواد الخصم" : "Discount Coupon Report") : isAr ? "تقرير اداء الحملات التسويقيه" : "Campaign Performance Report";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title, { views: [{ rightToLeft: isAr }] });
  const weekWord = isAr ? "الأسبوع" : "Week";
  const headers = [
    ...(isAr ? ["#", "المنطقة", "موقع العمل", "عملاء جدد", "عملاء حاليون"] : ["SR.No", "Region", "Store", "New Customers", "Existing Customers"]),
    ...(isCoupon ? (isAr ? ["الرمز الترويجي", "اسم الشركة"] : ["Promocode", "Company Name"]) : []),
    ...(isAr ? ["المعاملات", "الوحدات", "متوسط السله", "المبيعات"] : ["Transactions", "Units", "Basket Size", "Sales"]),
    ...report.weeks.flatMap((w) => [`${weekWord} ${w.index} (${w.label})`, `LFL ${w.index}`]),
  ];
  const width = headers.length;
  const extra = isCoupon
    ? [`${isAr ? "قسيمة خصم" : "Coupon"}: ${report.coupon?.code ?? "-"}`]
    : [`${isAr ? "العرض الترويجي" : "Promotion"}: ${report.promotion?.name ?? "-"}`];
  let r = writeSheetHeader(sheet, [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, extra)], width, `${report.startDate} ~ ${report.endDate}`);
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  const pct = (v: string | null) => (v === null ? "-" : `${v}%`);
  const figures = (f: NonNullable<typeof report.totals>, companyName: string) => [
    f.newCustomers,
    f.existingCustomers,
    ...(isCoupon ? [report.coupon?.code ?? "", companyName] : []),
    f.transactions,
    Number(f.units),
    Number(f.basketSize),
    Number(f.sales),
    ...f.weeks.flatMap((w) => [Number(w.sales), pct(w.lfl)]),
  ];
  report.rows.forEach((row, i) => {
    sheet.getRow(r).values = [
      i + 1,
      row.region ? pickName(row.region, isAr) : "",
      `${isAr ? row.store.branchNameAr || row.store.branchName : row.store.branchName} (${row.store.branchCode})`,
      ...figures(row, row.companyName),
    ];
    r++;
  });
  const t = report.totals;
  if (t) {
    sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", ...figures(t, t.companyName)];
    sheet.getRow(r).font = { bold: true };
  }
  for (let c = 1; c <= width; c++) sheet.getColumn(c).width = c <= 3 ? [8, 18, 26][c - 1] : 16;
  return { workbook, filename: xlsxFilename(isCoupon ? "Discount_Coupon_Report" : "Campaign_Performance_Report") };
}

export const campaignPerformanceReportXlsx = (query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) =>
  campaignXlsx(query, organizationId, allowedLocationIds, "promotion");
export const discountCouponReportXlsx = (query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) =>
  campaignXlsx(query, organizationId, allowedLocationIds, "coupon");
