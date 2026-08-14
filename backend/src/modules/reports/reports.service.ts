import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

const { Decimal } = Prisma;

function resolveRange(query: Record<string, unknown>) {
  const to = query.to ? new Date(String(query.to)) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = query.from ? new Date(String(query.from)) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/**
 * Narrows to a single requested location only if the caller is actually allowed to see it -
 * a plain override (letting query.businessLocationId replace the allowed-set filter outright)
 * would let a non-admin request a location outside their assignment. `null` means "no location
 * restriction" (system admin with no specific location requested).
 */
function resolveLocationIds(query: Record<string, unknown>, allowedLocationIds: string[] | null): string[] | null {
  if (query.businessLocationId) {
    const requested = String(query.businessLocationId);
    if (allowedLocationIds && !allowedLocationIds.includes(requested)) return [];
    return [requested];
  }
  return allowedLocationIds;
}

export async function salesReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { from, to } = resolveRange(query);
  const locationIds = resolveLocationIds(query, allowedLocationIds);
  const locationFilter = {
    organizationId,
    ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
  };

  const sales = await prisma.sale.findMany({
    // FINAL only - a DRAFT quote has never actually sold anything yet, so it must not inflate
    // revenue/tax/discount totals just because it happens to have priced-out SaleItem rows.
    where: { ...locationFilter, saleDate: { gte: from, lte: to }, status: "FINAL" },
    select: { id: true, saleDate: true, subtotal: true, discountAmount: true, taxAmount: true, totalAmount: true },
  });

  const totalSales = sales.reduce((sum, s) => sum.add(s.totalAmount), new Decimal(0));
  const totalTax = sales.reduce((sum, s) => sum.add(s.taxAmount), new Decimal(0));
  const totalDiscount = sales.reduce((sum, s) => sum.add(s.discountAmount), new Decimal(0));
  const invoiceCount = sales.length;
  const avgTicket = invoiceCount > 0 ? totalSales.div(invoiceCount) : new Decimal(0);

  // Bucket by calendar day (server-local) - the report's date range is small enough (weeks, not
  // years) that grouping in JS is simpler than a raw SQL date_trunc and avoids a second query shape.
  const byDayMap = new Map<string, { total: Prisma.Decimal; count: number }>();
  for (const sale of sales) {
    const key = sale.saleDate.toISOString().slice(0, 10);
    const bucket = byDayMap.get(key) ?? { total: new Decimal(0), count: 0 };
    bucket.total = bucket.total.add(sale.totalAmount);
    bucket.count += 1;
    byDayMap.set(key, bucket);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, v]) => ({ date, total: v.total, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const paymentRows = await prisma.payment.groupBy({
    by: ["paymentMethodId"],
    where: {
      type: "SALE_PAYMENT",
      paymentDate: { gte: from, lte: to },
      businessLocation: {
        organizationId,
        ...(locationIds ? { id: { in: locationIds } } : {}),
      },
    },
    _sum: { amount: true },
  });
  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { id: { in: paymentRows.map((r) => r.paymentMethodId) } },
    select: { id: true, nameEn: true, nameAr: true },
  });
  const byPaymentMethod = paymentRows.map((r) => {
    const method = paymentMethods.find((m) => m.id === r.paymentMethodId);
    return {
      paymentMethodId: r.paymentMethodId,
      nameEn: method?.nameEn ?? "Unknown",
      nameAr: method?.nameAr ?? "Unknown",
      total: r._sum.amount ?? new Decimal(0),
    };
  });

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    summary: { totalSales, totalTax, totalDiscount, invoiceCount, avgTicket },
    byDay,
    byPaymentMethod,
  };
}

export async function accountingReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { from, to } = resolveRange(query);
  const locationIds = resolveLocationIds(query, allowedLocationIds);
  const locationFilter = {
    organizationId,
    ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
  };

  const sales = await prisma.sale.findMany({
    // FINAL only - a DRAFT quote has never actually sold anything yet, so it must not inflate
    // revenue/tax/discount totals just because it happens to have priced-out SaleItem rows.
    where: { ...locationFilter, saleDate: { gte: from, lte: to }, status: "FINAL" },
    select: { saleDate: true, subtotal: true, discountAmount: true, taxAmount: true, totalAmount: true },
  });

  const grossRevenue = sales.reduce((sum, s) => sum.add(s.subtotal).add(s.discountAmount), new Decimal(0)); // pre-discount goods value
  const totalDiscount = sales.reduce((sum, s) => sum.add(s.discountAmount), new Decimal(0));
  const netRevenue = sales.reduce((sum, s) => sum.add(s.subtotal), new Decimal(0)); // post-discount, excl. VAT - what's actually recognized
  const vatCollected = sales.reduce((sum, s) => sum.add(s.taxAmount), new Decimal(0));
  const totalInvoiced = sales.reduce((sum, s) => sum.add(s.totalAmount), new Decimal(0));

  // Bucket by calendar month - an accounting view spans a wider horizon than the daily sales
  // report, so monthly is the more useful granularity here.
  const byMonthMap = new Map<string, { netRevenue: Prisma.Decimal; vat: Prisma.Decimal; count: number }>();
  for (const sale of sales) {
    const key = sale.saleDate.toISOString().slice(0, 7);
    const bucket = byMonthMap.get(key) ?? { netRevenue: new Decimal(0), vat: new Decimal(0), count: 0 };
    bucket.netRevenue = bucket.netRevenue.add(sale.subtotal);
    bucket.vat = bucket.vat.add(sale.taxAmount);
    bucket.count += 1;
    byMonthMap.set(key, bucket);
  }
  const byMonth = Array.from(byMonthMap.entries())
    .map(([month, v]) => ({ month, netRevenue: v.netRevenue, vat: v.vat, count: v.count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Receivables are a point-in-time snapshot (who owes us money right now), not scoped to the
  // date range - a customer's outstanding balance isn't a "this month" concept.
  const debtors = await prisma.customer.findMany({
    where: { organizationId, deletedAt: null, balance: { gt: 0 }, ...(locationIds ? { businessLocationId: { in: locationIds } } : {}) },
    select: { balance: true },
  });
  const totalReceivables = debtors.reduce((sum, c) => sum.add(c.balance), new Decimal(0));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    summary: { grossRevenue, totalDiscount, netRevenue, vatCollected, totalInvoiced, invoiceCount: sales.length },
    receivables: { total: totalReceivables, customerCount: debtors.length },
    byMonth,
  };
}

export async function salesByServiceReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { from, to } = resolveRange(query);
  const locationIds = resolveLocationIds(query, allowedLocationIds);

  const items = await prisma.saleItem.findMany({
    where: {
      serviceId: { not: null },
      sale: {
        organizationId,
        status: "FINAL",
        saleDate: { gte: from, lte: to },
        ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
      },
    },
    select: {
      serviceId: true,
      quantity: true,
      subtotal: true,
      taxAmount: true,
      total: true,
      service: { select: { nameEn: true, nameAr: true, category: { select: { nameEn: true, nameAr: true } } } },
    },
  });

  const byServiceMap = new Map<
    string,
    { nameEn: string; nameAr: string; categoryNameEn: string | null; categoryNameAr: string | null; quantity: Prisma.Decimal; subtotal: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal; count: number }
  >();
  for (const item of items) {
    const key = item.serviceId!;
    const bucket = byServiceMap.get(key) ?? {
      nameEn: item.service?.nameEn ?? "Unknown",
      nameAr: item.service?.nameAr ?? "Unknown",
      categoryNameEn: item.service?.category?.nameEn ?? null,
      categoryNameAr: item.service?.category?.nameAr ?? null,
      quantity: new Decimal(0),
      subtotal: new Decimal(0),
      tax: new Decimal(0),
      total: new Decimal(0),
      count: 0,
    };
    bucket.quantity = bucket.quantity.add(item.quantity);
    bucket.subtotal = bucket.subtotal.add(item.subtotal);
    bucket.tax = bucket.tax.add(item.taxAmount);
    bucket.total = bucket.total.add(item.total);
    bucket.count += 1;
    byServiceMap.set(key, bucket);
  }

  const rows = Array.from(byServiceMap.entries())
    .map(([serviceId, v]) => ({ serviceId, ...v }))
    .sort((a, b) => b.total.cmp(a.total));

  const totalRevenue = rows.reduce((sum, r) => sum.add(r.total), new Decimal(0));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    summary: { totalRevenue, serviceCount: rows.length },
    rows,
  };
}

const AGING_BUCKETS = [
  { key: "0-30", minDays: 0, maxDays: 30 },
  { key: "31-60", minDays: 31, maxDays: 60 },
  { key: "61-90", minDays: 61, maxDays: 90 },
  { key: "90+", minDays: 91, maxDays: Infinity },
] as const;

function bucketForAge(ageDays: number): (typeof AGING_BUCKETS)[number]["key"] {
  return AGING_BUCKETS.find((b) => ageDays >= b.minDays && ageDays <= b.maxDays)!.key;
}

export async function arAgingReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const locationIds = resolveLocationIds(query, allowedLocationIds);
  const now = new Date();

  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: "FINAL",
      dueAmount: { gt: 0 },
      ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
    },
    select: { id: true, invoiceNumber: true, saleDate: true, dueAmount: true, customerId: true, customer: { select: { nameEn: true, nameAr: true, phone: true } } },
    orderBy: { saleDate: "asc" },
  });

  const byCustomerMap = new Map<
    string,
    { nameEn: string; nameAr: string; phone: string; buckets: Record<string, Prisma.Decimal>; total: Prisma.Decimal }
  >();
  const bucketTotals: Record<string, Prisma.Decimal> = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, new Decimal(0)]));

  for (const sale of sales) {
    const ageDays = Math.floor((now.getTime() - sale.saleDate.getTime()) / (24 * 60 * 60 * 1000));
    const bucketKey = bucketForAge(ageDays);
    bucketTotals[bucketKey] = bucketTotals[bucketKey].add(sale.dueAmount);

    const entry = byCustomerMap.get(sale.customerId) ?? {
      nameEn: sale.customer.nameEn,
      nameAr: sale.customer.nameAr ?? sale.customer.nameEn,
      phone: sale.customer.phone,
      buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, new Decimal(0)])),
      total: new Decimal(0),
    };
    entry.buckets[bucketKey] = entry.buckets[bucketKey].add(sale.dueAmount);
    entry.total = entry.total.add(sale.dueAmount);
    byCustomerMap.set(sale.customerId, entry);
  }

  const rows = Array.from(byCustomerMap.entries())
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.total.cmp(a.total));

  const grandTotal = Object.values(bucketTotals).reduce((sum, v) => sum.add(v), new Decimal(0));

  return {
    asOf: now.toISOString().slice(0, 10),
    buckets: AGING_BUCKETS.map((b) => b.key),
    bucketTotals,
    grandTotal,
    rows,
  };
}

export async function apAgingReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const locationIds = resolveLocationIds(query, allowedLocationIds);
  const now = new Date();

  const purchases = await prisma.purchase.findMany({
    where: {
      organizationId,
      ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
    },
    select: { id: true, referenceNumber: true, purchaseDate: true, totalAmount: true, paidAmount: true, supplierId: true, supplier: { select: { nameEn: true, nameAr: true, phone: true } } },
    orderBy: { purchaseDate: "asc" },
  });

  const byPurchase = purchases
    .map((p) => ({ ...p, due: p.totalAmount.sub(p.paidAmount) }))
    .filter((p) => p.due.gt(0));

  const bySupplierMap = new Map<
    string,
    { nameEn: string; nameAr: string; phone: string; buckets: Record<string, Prisma.Decimal>; total: Prisma.Decimal }
  >();
  const bucketTotals: Record<string, Prisma.Decimal> = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, new Decimal(0)]));

  for (const p of byPurchase) {
    const ageDays = Math.floor((now.getTime() - p.purchaseDate.getTime()) / (24 * 60 * 60 * 1000));
    const bucketKey = bucketForAge(ageDays);
    bucketTotals[bucketKey] = bucketTotals[bucketKey].add(p.due);

    const entry = bySupplierMap.get(p.supplierId) ?? {
      nameEn: p.supplier.nameEn,
      nameAr: p.supplier.nameAr ?? p.supplier.nameEn,
      phone: p.supplier.phone,
      buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, new Decimal(0)])),
      total: new Decimal(0),
    };
    entry.buckets[bucketKey] = entry.buckets[bucketKey].add(p.due);
    entry.total = entry.total.add(p.due);
    bySupplierMap.set(p.supplierId, entry);
  }

  const rows = Array.from(bySupplierMap.entries())
    .map(([supplierId, v]) => ({ supplierId, ...v }))
    .sort((a, b) => b.total.cmp(a.total));

  const grandTotal = Object.values(bucketTotals).reduce((sum, v) => sum.add(v), new Decimal(0));

  return {
    asOf: now.toISOString().slice(0, 10),
    buckets: AGING_BUCKETS.map((b) => b.key),
    bucketTotals,
    grandTotal,
    rows,
  };
}

export async function staffProductivityReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { from, to } = resolveRange(query);
  const locationIds = resolveLocationIds(query, allowedLocationIds);

  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      status: "FINAL",
      saleDate: { gte: from, lte: to },
      ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
    },
    select: { totalAmount: true, createdBy: true, createdByUser: { select: { fullNameEn: true, fullNameAr: true } } },
  });

  const byStaffMap = new Map<string, { nameEn: string; nameAr: string; totalSales: Prisma.Decimal; invoiceCount: number }>();
  for (const sale of sales) {
    const entry = byStaffMap.get(sale.createdBy) ?? {
      nameEn: sale.createdByUser.fullNameEn,
      nameAr: sale.createdByUser.fullNameAr ?? sale.createdByUser.fullNameEn,
      totalSales: new Decimal(0),
      invoiceCount: 0,
    };
    entry.totalSales = entry.totalSales.add(sale.totalAmount);
    entry.invoiceCount += 1;
    byStaffMap.set(sale.createdBy, entry);
  }

  const rows = Array.from(byStaffMap.entries())
    .map(([userId, v]) => ({ userId, ...v, avgTicket: v.invoiceCount > 0 ? v.totalSales.div(v.invoiceCount) : new Decimal(0) }))
    .sort((a, b) => b.totalSales.cmp(a.totalSales));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rows,
  };
}

export async function vatBreakdownReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { from, to } = resolveRange(query);
  const locationIds = resolveLocationIds(query, allowedLocationIds);

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        organizationId,
        status: "FINAL",
        saleDate: { gte: from, lte: to },
        ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
      },
    },
    select: { taxPercent: true, taxCategoryCode: true, subtotal: true, taxAmount: true },
  });

  const byRateMap = new Map<string, { taxPercent: Prisma.Decimal; taxCategoryCode: string; subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; lineCount: number }>();
  for (const item of items) {
    const key = `${item.taxPercent.toString()}|${item.taxCategoryCode}`;
    const bucket = byRateMap.get(key) ?? {
      taxPercent: item.taxPercent,
      taxCategoryCode: item.taxCategoryCode,
      subtotal: new Decimal(0),
      taxAmount: new Decimal(0),
      lineCount: 0,
    };
    bucket.subtotal = bucket.subtotal.add(item.subtotal);
    bucket.taxAmount = bucket.taxAmount.add(item.taxAmount);
    bucket.lineCount += 1;
    byRateMap.set(key, bucket);
  }

  const rows = Array.from(byRateMap.values()).sort((a, b) => b.taxAmount.cmp(a.taxAmount));
  const totalTax = rows.reduce((sum, r) => sum.add(r.taxAmount), new Decimal(0));
  const totalTaxableBase = rows.reduce((sum, r) => sum.add(r.subtotal), new Decimal(0));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    summary: { totalTax, totalTaxableBase },
    rows,
  };
}

export async function inventoryReport(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const locationIds = resolveLocationIds(query, allowedLocationIds);
  const stocks = await prisma.productStock.findMany({
    where: {
      ...(locationIds ? { businessLocationId: { in: locationIds } } : {}),
      product: { organizationId, status: "ACTIVE", deletedAt: null, manageStock: true },
    },
    include: {
      product: { select: { id: true, nameEn: true, nameAr: true, sku: true, alertQuantity: true, purchasePrice: true, sellingPrice: true } },
      businessLocation: { select: { id: true, branchName: true } },
    },
  });

  const rows = stocks.map((s) => ({
    productId: s.product.id,
    nameEn: s.product.nameEn,
    nameAr: s.product.nameAr,
    sku: s.product.sku,
    businessLocationId: s.businessLocationId,
    branchName: s.businessLocation.branchName,
    quantity: s.quantity,
    alertQuantity: s.product.alertQuantity,
    isLowStock: s.product.alertQuantity !== null && s.quantity.lte(s.product.alertQuantity),
    // purchasePrice defaults to 0 (not null) when never entered, so a plain `?? sellingPrice`
    // never falls through - valuing at cost only kicks in once a real cost has been recorded.
    stockValue: s.quantity.mul(s.product.purchasePrice.gt(0) ? s.product.purchasePrice : s.product.sellingPrice),
  }));

  const lowStockOnly = query.lowStockOnly === "true";
  const filtered = lowStockOnly ? rows.filter((r) => r.isLowStock) : rows;

  const totalStockValue = rows.reduce((sum, r) => sum.add(r.stockValue), new Decimal(0));
  const lowStockCount = rows.filter((r) => r.isLowStock).length;

  return {
    summary: { totalSkus: rows.length, totalStockValue, lowStockCount },
    rows: filtered,
  };
}
