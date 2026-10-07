import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { itemScopeWhere, parseAppScope,
  locationFiltersText,
  parseIdList,
  productCategoryTree,
  parseReportLocationQuery,
  pickName,
  reportDateWindow,
  reportHeaderText,
  resolveReportLocations,
  styleHeaderRow,
  writeSheetHeader,
  xlsxFilename,
} from "./reportCommon";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Reference's "Products Report" (ReportController@getProductsReport + TransactionUtil::
 * getProductsReportData + report/products_report.blade.php): one row per branch x item with the
 * number of invoices it appeared on, quantity, before-tax (after line discount, as the reference's
 * `quantity * unit_price`), line discount, tax, extra services and total.
 *
 * Items are products and services alike (a laundry item is a Service here), and the Category /
 * Product filters accept both. Extra Services is the reference's modifier lines
 * (`parent_sell_line_id`); this app has no modifier lines, so it is always 0.
 *
 * Deliberate deviations, each fixing a reference defect:
 *  - Only FINAL invoices (the reference counts every `type='sell'` row, drafts included).
 *  - Customer group filters on the invoice's own group snapshot (Sale.customerGroupId), as the
 *    Companies reports do, not the customer's *current* group (`contacts.customer_group_id`),
 *    which silently moves history when a customer changes group.
 *  - No branch picked = every permitted branch (the reference renders an empty table).
 */

export function parseItemFilters(query: Record<string, unknown>) {
  const itemIds = parseIdList(query.itemIds);
  const categoryId = query.categoryId ? String(query.categoryId) : undefined;
  return {
    productIds: itemIds.filter((k) => k.startsWith("p:")).map((k) => k.slice(2)),
    serviceIds: itemIds.filter((k) => k.startsWith("s:")).map((k) => k.slice(2)),
    explicitItems: itemIds.length > 0,
    productCategoryId: categoryId?.startsWith("pc:") ? categoryId.slice(3) : undefined,
    serviceCategoryId: categoryId?.startsWith("sc:") ? categoryId.slice(3) : undefined,
    categoryId,
  };
}

/** Sale-line filter for the Category / Product pickers. Reference: picked products win over the category. */
export function saleItemFilter(f: ReturnType<typeof parseItemFilters>, productCategoryIds: string[] = []): Prisma.SaleItemWhereInput {
  if (f.explicitItems) {
    return { OR: [...(f.productIds.length ? [{ productId: { in: f.productIds } }] : []), ...(f.serviceIds.length ? [{ serviceId: { in: f.serviceIds } }] : [])] };
  }
  // A top-level category also covers products filed under its sub-categories (see productCategoryTree).
  if (f.productCategoryId) return { product: { categoryId: { in: productCategoryIds } } };
  if (f.serviceCategoryId) return { service: { categoryId: f.serviceCategoryId } };
  return { OR: [{ productId: { not: null } }, { serviceId: { not: null } }] };
}

/** Names of the picked category / items for the filters line. */
export async function itemFilterNames(f: ReturnType<typeof parseItemFilters>, organizationId: string) {
  const [productCategory, serviceCategory, products, services] = await Promise.all([
    f.productCategoryId ? prisma.category.findFirst({ where: { id: f.productCategoryId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    f.serviceCategoryId ? prisma.serviceCategory.findFirst({ where: { id: f.serviceCategoryId, organizationId }, select: { nameEn: true, nameAr: true } }) : null,
    f.productIds.length ? prisma.product.findMany({ where: { id: { in: f.productIds }, organizationId }, select: { nameEn: true, nameAr: true } }) : [],
    f.serviceIds.length ? prisma.service.findMany({ where: { id: { in: f.serviceIds }, organizationId }, select: { nameEn: true, nameAr: true } }) : [],
  ]);
  if (f.categoryId && !productCategory && !serviceCategory) throw new NotFoundError("Category not found");
  return { category: productCategory ?? serviceCategory ?? null, items: f.explicitItems ? [...products, ...services] : null };
}

export async function customerGroupName(customerGroupId: string | undefined, organizationId: string) {
  if (!customerGroupId) return null;
  const group = await prisma.customerGroup.findFirst({ where: { id: customerGroupId, organizationId }, select: { nameEn: true, nameAr: true } });
  if (!group) throw new NotFoundError("Customer group not found");
  return group;
}

export async function productsReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const q = parseReportLocationQuery(query);
  const scope = parseAppScope(query);
  const customerGroupId = query.customerGroupId ? String(query.customerGroupId) : undefined;
  const itemFilters = parseItemFilters(query);
  const { startDate, endDate, from, to } = reportDateWindow(q);
  const { locations, filters } = await resolveReportLocations(q, organizationId, allowedLocationIds);
  const [customerGroup, names, tree] = await Promise.all([customerGroupName(customerGroupId, organizationId), itemFilterNames(itemFilters, organizationId), productCategoryTree(organizationId)]);
  const productCategoryIds = itemFilters.productCategoryId ? tree.subtree(itemFilters.productCategoryId) : [];

  const lines = await prisma.saleItem.findMany({
    where: {
      AND: [saleItemFilter(itemFilters, productCategoryIds), itemScopeWhere(scope)],
      sale: {
        organizationId,
        status: "FINAL",
        businessLocationId: { in: locations.map((l) => l.id) },
        saleDate: { gte: from, lte: to },
        ...(customerGroupId ? { customerGroupId } : {}),
      },
    },
    select: {
      saleId: true,
      quantity: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      sale: { select: { businessLocationId: true } },
      product: { select: { id: true, nameEn: true, nameAr: true, sku: true } },
      service: { select: { id: true, nameEn: true, nameAr: true, code: true } },
    },
  });

  type Acc = { key: string; locationId: string; sku: string; nameEn: string; nameAr: string | null; invoices: Set<string>; qty: Decimal; beforeTax: Decimal; discount: Decimal; tax: Decimal };
  const groups = new Map<string, Acc>();
  for (const line of lines) {
    const thing = line.product ?? line.service;
    if (!thing) continue;
    const itemKey = `${line.product ? "p" : "s"}:${thing.id}`;
    const key = `${line.sale.businessLocationId}|${itemKey}`;
    const acc =
      groups.get(key) ??
      ({
        key,
        locationId: line.sale.businessLocationId,
        sku: line.product ? line.product.sku : line.service!.code,
        nameEn: thing.nameEn,
        nameAr: thing.nameAr,
        invoices: new Set<string>(),
        qty: new Decimal(0),
        beforeTax: new Decimal(0),
        discount: new Decimal(0),
        tax: new Decimal(0),
      } satisfies Acc);
    acc.invoices.add(line.saleId);
    acc.qty = acc.qty.add(line.quantity);
    acc.beforeTax = acc.beforeTax.add(line.subtotal);
    acc.discount = acc.discount.add(line.discountAmount);
    acc.tax = acc.tax.add(line.taxAmount);
    groups.set(key, acc);
  }

  const locationOrder = new Map(locations.map((l, i) => [l.id, i]));
  const locationById = new Map(locations.map((l) => [l.id, l]));
  const zero = () => new Decimal(0);
  const totals = { invoiceCount: 0, totalItems: zero(), beforeTax: zero(), discount: zero(), tax: zero(), extraServices: zero(), total: zero() };
  const rows = [...groups.values()]
    .sort((a, b) => locationOrder.get(a.locationId)! - locationOrder.get(b.locationId)! || a.nameEn.localeCompare(b.nameEn))
    .map((g) => {
      const location = locationById.get(g.locationId)!;
      const total = g.beforeTax.add(g.tax);
      totals.invoiceCount += g.invoices.size;
      totals.totalItems = totals.totalItems.add(g.qty);
      totals.beforeTax = totals.beforeTax.add(g.beforeTax);
      totals.discount = totals.discount.add(g.discount);
      totals.tax = totals.tax.add(g.tax);
      totals.total = totals.total.add(total);
      return {
        key: g.key,
        sku: g.sku,
        nameEn: g.nameEn,
        nameAr: g.nameAr,
        branchName: location.branchName,
        branchNameAr: location.branchNameAr,
        branchCode: location.branchCode,
        invoiceCount: g.invoices.size,
        totalItems: g.qty.toFixed(2),
        beforeTax: g.beforeTax.toFixed(2),
        discount: g.discount.toFixed(2),
        tax: g.tax.toFixed(2),
        extraServices: "0.00",
        total: total.toFixed(2),
      };
    });

  return {
    startDate,
    endDate,
    filters: { ...filters, customerGroup, category: names.category, items: names.items },
    rows,
    totals: {
      invoiceCount: totals.invoiceCount,
      totalItems: totals.totalItems.toFixed(2),
      beforeTax: totals.beforeTax.toFixed(2),
      discount: totals.discount.toFixed(2),
      tax: totals.tax.toFixed(2),
      extraServices: totals.extraServices.toFixed(2),
      total: totals.total.toFixed(2),
    },
  };
}

export function itemFiltersText(
  f: { customerGroup: { nameEn: string; nameAr: string | null } | null; category?: { nameEn: string; nameAr: string | null } | null; items?: { nameEn: string; nameAr: string | null }[] | null },
  isAr: boolean,
) {
  return [
    f.customerGroup ? `${isAr ? "مجموعة العملاء" : "Customer Group"}: ${pickName(f.customerGroup, isAr)}` : "",
    f.category ? `${isAr ? "الفئة" : "Category"}: ${pickName(f.category, isAr)}` : "",
    f.items ? `${isAr ? "المنتج" : "Product"}: ${f.items.map((i) => pickName(i, isAr)).join(", ")}` : "",
  ].filter(Boolean);
}

export async function productsReportXlsx(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const report = await productsReport(query, organizationId, allowedLocationIds);
  const isAr = query.lang === "ar";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isAr ? "تقرير المنتجات" : "Products Report", { views: [{ rightToLeft: isAr }] });
  const headers = isAr
    ? ["رمز المنتج", "المنتج", "موقع العمل", "عدد الفواتير", "مجموع العناصر", "الاجمالى قبل الضريبة", "الخصم", "الضريبة", "خدمات اضافيه", "المجموع"]
    : ["SKU", "Product", "Business Location", "Invoice Count", "Total Items", "Total Before Tax", "Discount", "Tax", "Extra Services", "Total"];
  const width = headers.length;
  let r = writeSheetHeader(
    sheet,
    [await reportHeaderText(organizationId), locationFiltersText(report.filters, isAr, itemFiltersText(report.filters, isAr))],
    width,
    `${report.startDate} ~ ${report.endDate}`,
  );
  sheet.getRow(r).values = headers;
  styleHeaderRow(sheet, r, width);
  r++;
  for (const row of report.rows) {
    sheet.getRow(r).values = [
      row.sku,
      isAr ? row.nameAr || row.nameEn : row.nameEn,
      `${isAr ? row.branchNameAr || row.branchName : row.branchName} (${row.branchCode})`,
      row.invoiceCount,
      ...[row.totalItems, row.beforeTax, row.discount, row.tax, row.extraServices, row.total].map(Number),
    ];
    r++;
  }
  const t = report.totals;
  sheet.getRow(r).values = [isAr ? "المجموع" : "Total", "", "", t.invoiceCount, ...[t.totalItems, t.beforeTax, t.discount, t.tax, t.extraServices, t.total].map(Number)];
  sheet.getRow(r).font = { bold: true };
  [16, 28, 28, 14, 14, 18, 12, 12, 14, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  for (let c = 5; c <= 10; c++) sheet.getColumn(c).numFmt = "#,##0.00";
  return { workbook, filename: xlsxFilename("Products_Report") };
}
