import type ExcelJS from "exceljs";
import type { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthorizationError, NotFoundError } from "../../utils/AppError";

/**
 * Shared plumbing for the reference's Reports dropdown (ReportController + report.js): every one
 * of those reports has the same Location Group / Business Location / Date Range filter frame,
 * the same "skip branches you can't see" scoping and the same Excel header lines.
 */

/** Every permission that opens a page under the Reports dropdown - gates the shared options endpoint. */
export const REPORT_PERMISSIONS = [
  "reports.daily_products",
  "reports.companies",
  "reports.detailed_companies",
  "reports.products",
  "reports.sales_report",
  "reports.detailed_sales",
  "reports.branch_sales",
  "reports.tax",
  "reports.register",
  "reports.compensations",
  "reports.cashback",
  "reports.loyalty_points",
  "reports.cash_register",
  "reports.customer_visits",
] as const;

export interface ReportLocationQuery {
  locationGroupId?: string;
  locationIds?: string[];
  from?: string;
  to?: string;
}

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD HH:mm" in server-local time (the reference prints transaction_date as stored). */
export function localDateTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Reference `products_names`: "qty name, qty name". */
export function productsNames(items: { quantity: { toDecimalPlaces(n: number): { toString(): string } }; descriptionEn: string; descriptionAr: string | null }[]) {
  return {
    productsEn: items.map((i) => `${i.quantity.toDecimalPlaces(3).toString()} ${i.descriptionEn}`).join(", "),
    productsAr: items.map((i) => `${i.quantity.toDecimalPlaces(3).toString()} ${i.descriptionAr || i.descriptionEn}`).join("، "),
  };
}

export function parseIdList(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : typeof raw === "string" && raw ? raw.split(",") : []).map(String).filter(Boolean);
}

export function parseReportLocationQuery(query: Record<string, unknown>): ReportLocationQuery {
  return {
    locationGroupId: query.locationGroupId ? String(query.locationGroupId) : undefined,
    locationIds: parseIdList(query.locationIds),
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
  };
}

/** The report's date window (defaults to today, the reference daterangepicker's default), as
 * server-local day boundaries. */
export function reportDateWindow(q: { from?: string; to?: string }) {
  const startDate = q.from ?? localToday();
  const endDate = q.to ?? startDate;
  return { startDate, endDate, from: new Date(`${startDate}T00:00:00`), to: new Date(`${endDate}T23:59:59.999`) };
}

export type ReportLocation = { id: string; branchName: string; branchNameAr: string | null; branchCode: string };

/**
 * Reference: explicit branches win; otherwise the picked group's branches; otherwise (our
 * deliberate deviation - the reference renders an empty table or crashes) every permitted branch.
 * Explicitly picking a branch the caller can't see is a 403, never a silent drop.
 */
export async function resolveReportLocations(q: ReportLocationQuery, organizationId: string, allowedLocationIds: string[] | null) {
  let locationGroup: { nameEn: string; nameAr: string | null } | null = null;
  if (q.locationGroupId) {
    locationGroup = await prisma.businessLocationGroup.findFirst({ where: { id: q.locationGroupId, organizationId }, select: { nameEn: true, nameAr: true } });
    if (!locationGroup) throw new NotFoundError("Location group not found");
  }
  const select = { id: true, branchName: true, branchNameAr: true, branchCode: true } as const;
  let locations: ReportLocation[];
  const explicit = Boolean(q.locationIds && q.locationIds.length > 0);
  if (explicit) {
    if (allowedLocationIds && q.locationIds!.some((id) => !allowedLocationIds.includes(id))) {
      throw new AuthorizationError("You do not have access to this business location");
    }
    locations = await prisma.businessLocation.findMany({ where: { organizationId, id: { in: q.locationIds } }, select, orderBy: { createdAt: "asc" } });
  } else {
    locations = await prisma.businessLocation.findMany({
      where: {
        organizationId,
        ...(q.locationGroupId ? { groupId: q.locationGroupId } : {}),
        ...(allowedLocationIds ? { id: { in: allowedLocationIds } } : {}),
      },
      select,
      orderBy: { createdAt: "asc" },
    });
  }
  return {
    locations,
    filters: {
      locationGroup,
      locations: explicit ? locations.map((l) => ({ branchName: l.branchName, branchNameAr: l.branchNameAr, branchCode: l.branchCode })) : null,
    },
  };
}

/** Filter options shared by every report page - served here so a user with only report access
 * gets them (/business-location-groups needs business_locations.update, /customer-groups needs
 * customers access). */
export async function reportOptions(organizationId: string, allowedLocationIds: string[] | null) {
  const [locationGroups, locations, customerGroups, productCategories, serviceCategories, products, services, users] = await Promise.all([
    prisma.businessLocationGroup.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.businessLocation.findMany({
      where: { organizationId, ...(allowedLocationIds ? { id: { in: allowedLocationIds } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, branchName: true, branchNameAr: true, branchCode: true, groupId: true },
    }),
    prisma.customerGroup.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    // Reference: top-level product categories only (`parent_id = 0`).
    prisma.category.findMany({ where: { organizationId, parentId: null }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true, code: true } }),
    prisma.serviceCategory.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.product.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true, sku: true, categoryId: true } }),
    prisma.service.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true, code: true, categoryId: true } }),
    prisma.user.findMany({ where: { organizationId }, orderBy: { fullNameEn: "asc" }, select: { id: true, fullNameEn: true, fullNameAr: true } }),
  ]);
  // Products and services share one Category / Product picker (a laundry item is a Service here),
  // keyed "pc:"/"sc:" and "p:"/"s:" so the report endpoints can tell them apart.
  return {
    locationGroups,
    locations,
    customerGroups,
    users,
    categories: [
      ...productCategories.map((c) => ({ key: `pc:${c.id}`, nameEn: c.code ? `${c.nameEn}-${c.code}` : c.nameEn, nameAr: c.nameAr })),
      ...serviceCategories.map((c) => ({ key: `sc:${c.id}`, nameEn: c.nameEn, nameAr: c.nameAr })),
    ],
    items: [
      ...products.map((p) => ({ key: `p:${p.id}`, nameEn: p.nameEn, nameAr: p.nameAr, code: p.sku, categoryKey: p.categoryId ? `pc:${p.categoryId}` : null })),
      ...services.map((v) => ({ key: `s:${v.id}`, nameEn: v.nameEn, nameAr: v.nameAr, code: v.code, categoryKey: v.categoryId ? `sc:${v.categoryId}` : null })),
    ],
  };
}

export const pickName = (x: { nameEn: string; nameAr: string | null }, isAr: boolean) => (isAr ? x.nameAr || x.nameEn : x.nameEn);

/** The " | "-joined filter line the reference prints under the report header (report.js `filters`). */
export function locationFiltersText(
  filters: { locationGroup: { nameEn: string; nameAr: string | null } | null; locations: { branchName: string; branchNameAr: string | null; branchCode: string }[] | null },
  isAr: boolean,
  extra: string[] = [],
) {
  return [
    filters.locationGroup ? `${isAr ? "مجموعات الفروع" : "Location Group"}: ${pickName(filters.locationGroup, isAr)}` : "",
    filters.locations
      ? `${isAr ? "موقع العمل" : "Business Location"}: ${filters.locations.map((l) => `${isAr ? l.branchNameAr || l.branchName : l.branchName} (${l.branchCode})`).join(", ")}`
      : "",
    ...extra,
  ]
    .filter(Boolean)
    .join(" | ");
}

export async function reportHeaderText(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { reportHeaderText: true } });
  return org.reportHeaderText ?? "";
}

export const XLSX_HEADER_FILL = "FF263BAA";

/** Centered, merged header lines (report header, filters, date range) at the top of a sheet. Returns the next free row. */
export function writeSheetHeader(sheet: ExcelJS.Worksheet, lines: string[], width: number, dateRange: string) {
  let r = 1;
  for (const line of lines.filter(Boolean)) {
    sheet.mergeCells(r, 1, r, width);
    sheet.getCell(r, 1).value = line;
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r++;
  }
  sheet.mergeCells(r, 1, r, width);
  sheet.getCell(r, 1).value = dateRange;
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  sheet.getCell(r, 1).font = { bold: true };
  return r + 1;
}

export function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNo: number, width: number) {
  const row = sheet.getRow(rowNo);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let c = 1; c <= width; c++) sheet.getCell(rowNo, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: XLSX_HEADER_FILL } };
}

/** Reference file names: `<Report>_<YmdHis>.xlsx`. */
export function xlsxFilename(base: string) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.xlsx`;
}

export async function sendXlsx(res: Response, workbook: ExcelJS.Workbook, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  return res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
}

/**
 * The reference keeps a product's top-level category in `category_id` (sub-categories live in a
 * separate `sub_category_id`), so every category-based report groups and filters by the top-level
 * category. Here a product may point straight at a sub-category, so resolve it upwards.
 */
export async function productCategoryTree(organizationId: string) {
  const all = await prisma.category.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true, code: true, parentId: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  const topOf = (id: string) => {
    let c = byId.get(id);
    const seen = new Set<string>();
    while (c?.parentId && byId.has(c.parentId) && !seen.has(c.id)) {
      seen.add(c.id);
      c = byId.get(c.parentId);
    }
    return c ?? null;
  };
  /** The category and every category below it. */
  const subtree = (id: string) => {
    const ids = [id];
    for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i] && !ids.includes(c.id)) ids.push(c.id);
    return ids;
  };
  return { topOf, subtree };
}
