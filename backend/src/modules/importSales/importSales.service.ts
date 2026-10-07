import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError, ValidationError } from "../../utils/AppError";
import { mapSheetRows, type ParsedSheet } from "../../utils/spreadsheet";
import { SALE_IMPORT_HEADER_MAP, parseSaleImportRow, type ParsedSaleLineRow } from "../../utils/saleImport";

const { Decimal } = Prisma;

export interface ImportResult {
  imported: number;
  errors: string[];
}

/** Reference's own "Imports" tab (import_sales/index.blade.php) - past import runs grouped by
 * batch, newest first, each with who ran it and which invoices it produced. */
export async function listBatches(organizationId: string) {
  const rows = await prisma.sale.findMany({
    where: { organizationId, importBatch: { not: null } },
    select: { importBatch: true, importedAt: true, invoiceNumber: true, createdByUser: { select: { fullNameEn: true } } },
    orderBy: { importBatch: "desc" },
  });

  const byBatch = new Map<number, { importBatch: number; importedAt: Date | null; createdBy: string; invoiceNumbers: string[] }>();
  for (const row of rows) {
    const batch = row.importBatch!;
    if (!byBatch.has(batch)) {
      byBatch.set(batch, { importBatch: batch, importedAt: row.importedAt, createdBy: row.createdByUser.fullNameEn, invoiceNumbers: [] });
    }
    byBatch.get(batch)!.invoiceNumbers.push(row.invoiceNumber ?? "");
  }
  return [...byBatch.values()];
}

/**
 * All-or-nothing, same convention as importCustomers (see customer.service.ts): every row is
 * parsed and every cross-row lookup (business location, customer, item, created-by user, duplicate
 * invoice numbers) is validated before anything is written; any problem anywhere aborts the whole
 * file with the FULL list of issues rather than partially importing and erroring on row 47.
 *
 * One invoice = one Sale, built by grouping rows on "Invoice No" (mirrors the reference's own
 * `$grouped_transactions[$entry[1]][$key]`). Always created FINAL/DUE (matching the reference's
 * own hardcoded `payment_status = 'due'` for every import) - historical invoices are assumed
 * already delivered, but payment history isn't part of this file format, so it's left owed and
 * collectible later via the normal "Add Payment" action. Never touches the ZATCA icv/hash chain
 * (see saleImport.ts's module comment) - imported rows stay unsigned, like a DRAFT sale.
 */
export async function importSales(sheet: ParsedSheet, organizationId: string, userId: string): Promise<ImportResult> {
  const rawRows = mapSheetRows(sheet, SALE_IMPORT_HEADER_MAP);
  if (rawRows.length === 0) throw new AppError(400, "No data rows found in the uploaded file");

  const errors: string[] = [];
  const parsed: { rowNumber: number; data: ParsedSaleLineRow }[] = [];
  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const result = parseSaleImportRow(raw, rowNumber);
    if ("error" in result) errors.push(result.error);
    else parsed.push({ rowNumber, data: result.data });
  });
  if (errors.length > 0) return { imported: 0, errors };

  const locationNames = [...new Set(parsed.map((p) => p.data.businessLocationName))];
  const locations = await prisma.businessLocation.findMany({ where: { organizationId }, select: { id: true, branchName: true } });
  const locationByName = new Map(locations.map((l) => [l.branchName.toLowerCase(), l]));
  for (const { rowNumber, data } of parsed) {
    if (!locationByName.has(data.businessLocationName.toLowerCase())) {
      errors.push(`Row ${rowNumber}: business location "${data.businessLocationName}" was not found`);
    }
  }

  const phones = [...new Set(parsed.map((p) => p.data.customerPhone))];
  const customers = await prisma.customer.findMany({ where: { organizationId, phone: { in: phones } }, select: { id: true, phone: true, customerGroupId: true } });
  const customerByPhone = new Map(customers.map((c) => [c.phone, c]));
  for (const { rowNumber, data } of parsed) {
    if (!customerByPhone.has(data.customerPhone)) errors.push(`Row ${rowNumber}: customer with phone "${data.customerPhone}" was not found`);
  }

  const itemCodes = [...new Set(parsed.map((p) => p.data.itemCode))];
  const [products, services] = await Promise.all([
    prisma.product.findMany({ where: { organizationId, sku: { in: itemCodes } }, include: { tax: { select: { percentage: true, categoryCode: true } } } }),
    prisma.service.findMany({ where: { organizationId, code: { in: itemCodes } }, include: { tax: { select: { percentage: true, categoryCode: true } } } }),
  ]);
  const productByCode = new Map(products.map((p) => [p.sku, p]));
  const serviceByCode = new Map(services.map((s) => [s.code, s]));
  for (const { rowNumber, data } of parsed) {
    if (!productByCode.has(data.itemCode) && !serviceByCode.has(data.itemCode)) {
      errors.push(`Row ${rowNumber}: item code "${data.itemCode}" was not found among products or services`);
    }
  }

  const usernames = [...new Set(parsed.map((p) => p.data.createdByUsername).filter((u): u is string => Boolean(u)))];
  const users = usernames.length > 0 ? await prisma.user.findMany({ where: { organizationId, username: { in: usernames } }, select: { id: true, username: true } }) : [];
  const userIdByUsername = new Map(users.map((u) => [u.username, u.id]));
  for (const { rowNumber, data } of parsed) {
    if (data.createdByUsername && !userIdByUsername.has(data.createdByUsername)) {
      errors.push(`Row ${rowNumber}: user "${data.createdByUsername}" was not found`);
    }
  }

  if (errors.length > 0) return { imported: 0, errors };

  const grouped = new Map<string, typeof parsed>();
  for (const line of parsed) {
    const key = line.data.invoiceNumber;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(line);
  }

  // All lines of one invoice must resolve to the same branch - invoiceNumber uniqueness (and the
  // Sale itself) is scoped to a single businessLocationId.
  for (const [invoiceNumber, lines] of grouped) {
    const locationIds = new Set(lines.map((l) => locationByName.get(l.data.businessLocationName.toLowerCase())!.id));
    if (locationIds.size > 1) errors.push(`Invoice "${invoiceNumber}": all lines must use the same Business Location`);
  }
  if (errors.length > 0) return { imported: 0, errors };

  const existingSales = await prisma.sale.findMany({
    where: { businessLocationId: { in: [...locationByName.values()].map((l) => l.id) }, invoiceNumber: { in: [...grouped.keys()] } },
    select: { invoiceNumber: true, businessLocationId: true },
  });
  for (const [invoiceNumber, lines] of grouped) {
    const location = locationByName.get(lines[0].data.businessLocationName.toLowerCase())!;
    if (existingSales.some((s) => s.invoiceNumber === invoiceNumber && s.businessLocationId === location.id)) {
      errors.push(`Invoice "${invoiceNumber}" already exists at ${location.branchName}`);
    }
  }
  if (errors.length > 0) return { imported: 0, errors };

  const maxBatch = await prisma.sale.aggregate({ where: { organizationId }, _max: { importBatch: true } });
  const importBatch = (maxBatch._max.importBatch ?? 0) + 1;
  const now = new Date();

  await prisma.$transaction(
    async (tx) => {
      for (const [invoiceNumber, lines] of grouped) {
        const location = locationByName.get(lines[0].data.businessLocationName.toLowerCase())!;
        const customer = customerByPhone.get(lines[0].data.customerPhone)!;
        const createdBy = lines[0].data.createdByUsername ? userIdByUsername.get(lines[0].data.createdByUsername)! : userId;

        let subtotal = new Decimal(0);
        let taxAmount = new Decimal(0);
        let hasProduct = false;
        let hasService = false;
        const lineRecords = lines.map(({ data }) => {
          const product = productByCode.get(data.itemCode);
          const service = serviceByCode.get(data.itemCode);
          const catalogItem = product ?? service!;

          const quantity = new Decimal(data.quantity);
          const unitPrice = new Decimal(data.unitPrice);
          const grossLine = unitPrice.mul(quantity);
          const discountAmount = grossLine.mul(data.discountPercent).div(100).toDecimalPlaces(2);
          const lineSubtotal = grossLine.sub(discountAmount).toDecimalPlaces(2);
          const taxPercent = data.taxPercent ?? (catalogItem.tax ? Number(catalogItem.tax.percentage) : 0);
          const lineTax = lineSubtotal.mul(taxPercent).div(100).toDecimalPlaces(2);

          subtotal = subtotal.add(lineSubtotal);
          taxAmount = taxAmount.add(lineTax);
          if (product) hasProduct = true;
          if (service) hasService = true;

          return {
            product,
            quantity,
            item: {
              productId: product?.id ?? null,
              serviceId: service?.id ?? null,
              descriptionEn: catalogItem.nameEn,
              descriptionAr: catalogItem.nameAr,
              quantity,
              unitPrice,
              taxPercent,
              taxAmount: lineTax,
              discountAmount,
              subtotal: lineSubtotal,
              total: lineSubtotal.add(lineTax),
              taxCategoryCode: catalogItem.tax?.categoryCode ?? "S",
              note: data.note,
              fulfillmentStatus: "PENDING" as const,
            },
          };
        });
        const totalAmount = subtotal.add(taxAmount);
        const saleType = hasProduct && hasService ? "MIXED" : hasProduct ? "PRODUCT" : "SERVICE";

        const sale = await tx.sale.create({
          data: {
            organizationId,
            businessLocationId: location.id,
            customerId: customer.id,
            customerGroupId: customer.customerGroupId,
            invoiceNumber,
            saleDate: lines[0].data.date ?? now,
            status: "FINAL",
            // Sale.isQuotation defaults to true (see its schema comment - a legacy-data
            // safeguard for pre-existing DRAFT rows) - every imported row here is FINAL, so this
            // must be explicitly false or it reads as a quote everywhere isQuotation is checked.
            isQuotation: false,
            paymentStatus: "DUE",
            saleType,
            channel: "ADD_SALE",
            subtotal: subtotal.toDecimalPlaces(2),
            taxAmount: taxAmount.toDecimalPlaces(2),
            totalAmount: totalAmount.toDecimalPlaces(2),
            paidAmount: 0,
            dueAmount: totalAmount.toDecimalPlaces(2),
            importBatch,
            importedAt: now,
            createdBy,
            items: { create: lineRecords.map((l) => l.item) },
          },
        });

        // Legacy backfill: never blocked by current stock levels (unlike a live checkout) - the
        // sale already happened historically, current inventory may have moved on since.
        for (const { product, quantity } of lineRecords) {
          if (!product?.manageStock) continue;
          const stock = await tx.productStock.findUnique({ where: { productId_businessLocationId: { productId: product.id, businessLocationId: location.id } } });
          const newQty = (stock?.quantity ?? new Decimal(0)).sub(quantity);
          await tx.productStock.upsert({
            where: { productId_businessLocationId: { productId: product.id, businessLocationId: location.id } },
            update: { quantity: newQty },
            create: { productId: product.id, businessLocationId: location.id, quantity: newQty },
          });
          await tx.inventoryTransaction.create({
            data: { productId: product.id, businessLocationId: location.id, type: "SALE", quantity: quantity.neg(), balanceAfter: newQty, referenceType: "SALE", referenceId: sale.id, createdBy },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  return { imported: grouped.size, errors: [] };
}

/** Reference's own "Revert Import" (SellReturnController@revertSaleImport, adapted here) -
 * deletes every sale from one batch and reverses any stock it decremented. Refuses if any sale in
 * the batch has since taken a real payment or return against it (the reference doesn't check this
 * and just deletes regardless - this app's own stricter convention, matching how SellReturn.
 * update() also refuses to shrink past what's already been refunded, rather than silently
 * orphaning a Payment/SellReturn row). */
export async function revertBatch(batch: number, organizationId: string) {
  const sales = await prisma.sale.findMany({
    where: { organizationId, importBatch: batch },
    include: { items: { include: { product: { select: { id: true, manageStock: true } } } }, payments: { select: { id: true } }, sellReturns: { select: { id: true } } },
  });
  if (sales.length === 0) throw new NotFoundError("Import batch not found");

  const blocked = sales.filter((s) => s.payments.length > 0 || s.sellReturns.length > 0);
  if (blocked.length > 0) {
    // Passed as the top-level message too (ValidationError's 2nd, normally-omitted constructor
    // arg) - the frontend's generic error handling only ever surfaces `response.data.message`,
    // never the nested per-field `errors[]`, so leaving this at the default "Validation failed"
    // would tell the user nothing actionable.
    const message = `Cannot revert: invoice ${blocked[0].invoiceNumber} already has a payment or return recorded against it`;
    throw new ValidationError([{ field: "batch", message }], message);
  }

  await prisma.$transaction(async (tx) => {
    for (const sale of sales) {
      for (const item of sale.items) {
        if (!item.product?.manageStock) continue;
        const stock = await tx.productStock.findUnique({ where: { productId_businessLocationId: { productId: item.product.id, businessLocationId: sale.businessLocationId } } });
        const newQty = (stock?.quantity ?? new Decimal(0)).add(item.quantity);
        await tx.productStock.update({ where: { productId_businessLocationId: { productId: item.product.id, businessLocationId: sale.businessLocationId } }, data: { quantity: newQty } });
        await tx.inventoryTransaction.create({
          data: {
            productId: item.product.id,
            businessLocationId: sale.businessLocationId,
            type: "ADJUSTMENT",
            quantity: item.quantity,
            balanceAfter: newQty,
            referenceType: "SALE_IMPORT_REVERT",
            referenceId: sale.id,
            note: `Reversal of imported sale ${sale.invoiceNumber} (batch ${batch})`,
          },
        });
      }
      await tx.sale.delete({ where: { id: sale.id } });
    }
  });

  return { reverted: sales.length };
}
