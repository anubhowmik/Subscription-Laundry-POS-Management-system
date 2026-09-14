import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import type { ParsedSheet } from "../../utils/spreadsheet";
import { mapSheetRows } from "../../utils/spreadsheet";
import { CONTACT_HEADER_MAP, CUSTOMER_GROUP_HEADER, PRICE_LIST_HEADER, INVOICE_LAYOUT_HEADER, parseContactRow, type ParsedContactRow } from "../../utils/contactImport";

const { Decimal } = Prisma;

const SORTABLE_FIELDS = ["nameEn", "createdAt", "balance"];

/** null = unrestricted (isSystemAdmin, or the actor has zero restriction rows). */
interface CustomerAccessScope {
  allowedCustomerIds: string[] | null;
  allowedCustomerGroupIds: string[] | null;
}

function customerAccessWhere(scope: CustomerAccessScope): Prisma.CustomerWhereInput {
  const or: Prisma.CustomerWhereInput[] = [];
  if (scope.allowedCustomerIds) or.push({ id: { in: scope.allowedCustomerIds } });
  if (scope.allowedCustomerGroupIds) or.push({ customerGroupId: { in: scope.allowedCustomerGroupIds } });
  if (or.length === 0) return {};
  return { OR: or };
}

/**
 * "Sell Due"/"Sell Return" - matching the EJADA reference's Customers list (`has_sell_due`/
 * `has_sell_return` in ContactController::indexCustomer()), computed fresh from actual FINAL sale/
 * return transactions rather than any stored field, same approach as supplier.service.ts's
 * `attachPurchaseDue`. `lastSaleDate` backs the "No sell from" filter below.
 */
async function attachSaleDue<T extends { id: string }>(
  customers: T[],
): Promise<(T & { totalSaleDue: number; totalSellReturnDue: number; lastSaleDate: Date | null })[]> {
  if (customers.length === 0) return [];
  const ids = customers.map((c) => c.id);
  const [saleAgg, returnAgg, lastSaleAgg] = await Promise.all([
    prisma.sale.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: "FINAL" }, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.sellReturn.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _sum: { totalAmount: true, refundedAmount: true } }),
    prisma.sale.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: "FINAL" }, _max: { saleDate: true } }),
  ]);
  const dueMap = new Map(saleAgg.map((s) => [s.customerId, Number(s._sum.totalAmount ?? 0) - Number(s._sum.paidAmount ?? 0)]));
  const returnDueMap = new Map(returnAgg.map((r) => [r.customerId, Number(r._sum.totalAmount ?? 0) - Number(r._sum.refundedAmount ?? 0)]));
  const lastSaleMap = new Map(lastSaleAgg.map((s) => [s.customerId, s._max.saleDate]));
  return customers.map((c) => ({
    ...c,
    totalSaleDue: dueMap.get(c.id) ?? 0,
    totalSellReturnDue: returnDueMap.get(c.id) ?? 0,
    lastSaleDate: lastSaleMap.get(c.id) ?? null,
  }));
}

/** Matches the reference's "Has No Sell From" dropdown (one_month/three_months/six_months/one_year). */
const NO_SELL_FROM_DAYS: Record<string, number> = { one_month: 30, three_months: 90, six_months: 180, one_year: 365 };

export async function list(query: Record<string, unknown>, organizationId: string, scope: CustomerAccessScope = { allowedCustomerIds: null, allowedCustomerGroupIds: null }) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");

  // SECURITY: `customerAccessWhere`'s restriction and the search box below both need an `OR`
  // clause - as two separate top-level `OR` keys on the same object literal, the second silently
  // clobbers the first, which would let a permission-restricted user's search bypass their own
  // access scope entirely. Combined into a single `AND` of both instead.
  const accessWhere = customerAccessWhere(scope);
  const searchWhere: Prisma.CustomerWhereInput = query.search
    ? {
        OR: [
          { nameEn: { contains: String(query.search), mode: "insensitive" } },
          { nameAr: { contains: String(query.search) } },
          { phone: { contains: String(query.search) } },
          { code: { contains: String(query.search), mode: "insensitive" } },
          { email: { contains: String(query.search), mode: "insensitive" } },
        ],
      }
    : {};
  const combinedFilters = [accessWhere, searchWhere].filter((w) => Object.keys(w).length > 0);

  const where: Prisma.CustomerWhereInput = {
    organizationId,
    deletedAt: null,
    ...(combinedFilters.length > 0 ? { AND: combinedFilters } : {}),
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.customerGroupId ? { customerGroupId: String(query.customerGroupId) } : {}),
    ...(query.approvalStatus ? { approvalStatus: query.approvalStatus as "PENDING" | "APPROVED" | "REJECTED" } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    // "Advance Balance"/"Opening Balance" filter checkboxes - matching the reference's own
    // Customers filters exactly (shared with Suppliers - see supplier.service.ts's list()).
    ...(query.hasAdvanceBalance === "true" ? { balance: { gt: 0 } } : {}),
    ...(query.hasOpeningBalance === "true" ? { openingBalance: { gt: 0 } } : {}),
  };

  const needsComputedFilter = query.hasSellDue === "true" || query.hasSellReturn === "true" || Boolean(query.hasNoSellFrom);

  if (!needsComputedFilter) {
    const [data, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy, skip, take: limit, include: { customerGroup: true } }),
      prisma.customer.count({ where }),
    ]);
    return { data: await attachSaleDue(data), meta: { page, limit, total } };
  }

  // "Sell Due"/"Sell Return"/"Has No Sell From" are computed, not stored, so they can't be pushed
  // into the SQL WHERE clause the way the other filters are - fetch every matching customer,
  // compute, filter, THEN paginate in memory. Same approach as supplier.service.ts's
  // hasPurchaseDue/hasPurchaseReturn branch.
  const all = await prisma.customer.findMany({ where, orderBy, include: { customerGroup: true } });
  const withDue = await attachSaleDue(all);
  const noSellCutoffDays = query.hasNoSellFrom ? NO_SELL_FROM_DAYS[String(query.hasNoSellFrom)] : undefined;
  const noSellCutoff = noSellCutoffDays ? new Date(Date.now() - noSellCutoffDays * 24 * 60 * 60 * 1000) : null;
  const filtered = withDue.filter((c) => {
    if (query.hasSellDue === "true" && !(c.totalSaleDue > 0)) return false;
    if (query.hasSellReturn === "true" && !(c.totalSellReturnDue > 0)) return false;
    // A customer who has never sold at all (lastSaleDate null) counts as "no sell from" too -
    // matches the reference's `orHavingRaw('transaction_date IS NULL')`.
    if (noSellCutoff && c.lastSaleDate && c.lastSaleDate >= noSellCutoff) return false;
    return true;
  });
  return { data: filtered.slice(skip, skip + limit), meta: { page, limit, total: filtered.length } };
}

export async function getById(id: string, organizationId: string, scope: CustomerAccessScope = { allowedCustomerIds: null, allowedCustomerGroupIds: null }) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId, deletedAt: null, ...customerAccessWhere(scope) },
    include: { customerGroup: true, businessLocation: true, contactPersons: true },
  });
  if (!customer) throw new NotFoundError("Customer not found");
  return customer;
}

async function generateCustomerCode(organizationId: string): Promise<string> {
  const count = await prisma.customer.count({ where: { organizationId } });
  return `CUST-${String(count + 1).padStart(5, "0")}`;
}

type ContactPersonInput = Omit<Prisma.CustomerContactPersonUncheckedCreateInput, "id" | "customerId" | "createdAt" | "updatedAt">;

export async function create(
  input: Omit<Prisma.CustomerUncheckedCreateInput, "organizationId" | "balance"> & {
    contactPersons?: ContactPersonInput[];
    dateOfBirth?: string | Date | null;
  },
  organizationId: string,
) {
  const { contactPersons, dateOfBirth, ...rest } = input;
  const existing = await prisma.customer.findFirst({ where: { organizationId, phone: rest.phone as string, deletedAt: null } });
  if (existing) throw new ConflictError("A customer with this phone number already exists");

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { customerApprovalRequired: true } });
  const approvalStatus = org?.customerApprovalRequired ? "PENDING" : "APPROVED";

  const openingBalance = rest.openingBalance ?? 0;
  const dob = dateOfBirth ? new Date(dateOfBirth) : undefined;
  const contactPersonsCreate = contactPersons?.length ? { create: contactPersons } : undefined;

  // A user-provided "Contact ID" (see createCustomerSchema's `code`) is used verbatim - matching
  // the reference app's own "leave empty to autogenerate" Contact ID field, same as Supplier's
  // create(). Its uniqueness is enforced by the existing @@unique([organizationId, code])
  // constraint (surfaces as a 409 via errorHandler.ts's generic P2002 handling).
  if (rest.code) {
    return prisma.customer.create({
      data: { ...rest, code: rest.code, organizationId, openingBalance, balance: openingBalance, approvalStatus, dateOfBirth: dob, contactPersons: contactPersonsCreate },
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await generateCustomerCode(organizationId);
    try {
      return await prisma.customer.create({
        data: { ...rest, code, organizationId, openingBalance, balance: openingBalance, approvalStatus, dateOfBirth: dob, contactPersons: contactPersonsCreate },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) {
        continue; // code collision under concurrent writes - retry with a fresh count
      }
      throw err;
    }
  }
  throw new Error("Failed to generate a unique customer code");
}

export async function update(
  id: string,
  input: Omit<Prisma.CustomerUncheckedUpdateInput, "dateOfBirth"> & { contactPersons?: ContactPersonInput[]; dateOfBirth?: string | Date | null },
  organizationId: string,
) {
  await getById(id, organizationId);
  const { contactPersons, dateOfBirth, ...rest } = input;
  return prisma.customer.update({
    where: { id },
    data: {
      ...rest,
      ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
      // The form owns the full list - replace wholesale rather than diffing, matching the
      // reference's own submit-the-whole-form behavior. Undefined (key absent) leaves rows alone.
      ...(contactPersons !== undefined ? { contactPersons: { deleteMany: {}, create: contactPersons } } : {}),
    },
  });
}

export async function deactivate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function activate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: { status: "ACTIVE" } });
}

export async function setApprovalStatus(id: string, status: "APPROVED" | "REJECTED", organizationId: string) {
  await getById(id, organizationId);
  return prisma.customer.update({ where: { id }, data: { approvalStatus: status } });
}

/**
 * Reconciles a customer's already-existing aggregate store credit against one specific unpaid
 * invoice, purely for accurate per-invoice reporting. Does NOT touch customer.balance - the
 * balance already correctly reflects the customer's net position (it was set once, correctly,
 * when the contributing sale/return was originally created); this only reclassifies how a given
 * invoice's own dueAmount is displayed. Touching balance again here would double-count.
 */
export async function applyCreditToSale(customerId: string, saleId: string, amount: number, organizationId: string, userId: string) {
  const customer = await getById(customerId, organizationId);
  const sale = await prisma.sale.findFirst({ where: { id: saleId, customerId, organizationId, status: "FINAL" } });
  if (!sale) throw new NotFoundError("Sale not found");
  if (sale.dueAmount.lte(0)) throw new ConflictError("This invoice has no outstanding balance");

  const availableCredit = customer.balance.lt(0) ? customer.balance.neg() : new Decimal(0);
  const amountDecimal = new Decimal(amount);
  const maxApplicable = Decimal.min(sale.dueAmount, availableCredit);
  if (amountDecimal.lte(0) || amountDecimal.gt(maxApplicable)) {
    throw new ConflictError(`Amount must be greater than 0 and no more than ${maxApplicable.toFixed(2)}`);
  }

  const storeCreditMethod = await prisma.paymentMethod.findFirst({ where: { organizationId, code: "STORE_CREDIT" } });
  if (!storeCreditMethod) throw new AppError(500, "Store credit payment method is not configured for this organization");

  const newPaidAmount = sale.paidAmount.add(amountDecimal);
  const newDueAmount = sale.dueAmount.sub(amountDecimal);
  let paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
  if (newPaidAmount.eq(0)) paymentStatus = "DUE";
  else if (newPaidAmount.gt(sale.totalAmount)) paymentStatus = "OVERPAID";
  else if (newPaidAmount.eq(sale.totalAmount)) paymentStatus = "PAID";
  else paymentStatus = "PARTIAL";

  return prisma.$transaction(async (tx) => {
    await tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: newPaidAmount.toDecimalPlaces(2), dueAmount: newDueAmount.toDecimalPlaces(2), paymentStatus },
    });
    await tx.payment.create({
      data: {
        saleId: sale.id,
        customerId,
        businessLocationId: sale.businessLocationId,
        amount: amountDecimal.toDecimalPlaces(2),
        paymentMethodId: storeCreditMethod.id,
        type: "SALE_PAYMENT",
        createdBy: userId,
      },
    });
    return tx.sale.findUniqueOrThrow({ where: { id: sale.id } });
  });
}

export async function getProfile(id: string, organizationId: string) {
  const customer = await getById(id, organizationId);
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({ where: { customerId: id, organizationId, status: "FINAL" }, orderBy: { saleDate: "desc" }, take: 20 }),
    prisma.payment.findMany({ where: { customerId: id }, orderBy: { paymentDate: "desc" }, take: 20 }),
  ]);
  return { customer, sales, payments };
}

export interface ImportResult {
  imported: number;
  errors: string[];
}

/**
 * All-or-nothing: every row is parsed and validated (including duplicate-phone, duplicate-code,
 * and name-lookup checks) before anything is written, and if ANY row fails the whole import is
 * rejected with the FULL list of problems (not just the first) - the person doing the import fixes
 * their file once and re-uploads, rather than fixing one row per attempt (unlike the reference
 * app's abort-on-first-error behavior).
 *
 * A row whose "Code" matches an existing customer's code UPDATES that customer instead of
 * creating a duplicate - converted from the reference's own `Contact::where('contact_id', ...)
 * ->first()` lookup-then-update-or-create - so re-uploading a previously-exported/imported file
 * with edited values is a real, working way to bulk-update contacts, not just a one-shot creator.
 */
export async function importCustomers(sheet: ParsedSheet, organizationId: string): Promise<ImportResult> {
  const rawRows = mapSheetRows(sheet, {
    ...CONTACT_HEADER_MAP,
    [CUSTOMER_GROUP_HEADER]: "customerGroupName",
    [PRICE_LIST_HEADER]: "priceListName",
    [INVOICE_LAYOUT_HEADER]: "invoiceLayoutName",
  });
  if (rawRows.length === 0) throw new AppError(400, "No data rows found in the uploaded file");

  const errors: string[] = [];
  const parsed: { rowNumber: number; data: ParsedContactRow }[] = [];
  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for the header row, +1 to make row 1 the first data row
    const result = parseContactRow(raw, rowNumber);
    if ("error" in result) errors.push(result.error);
    else parsed.push({ rowNumber, data: result.data });
  });

  // Duplicate codes within the file itself - unlike the reference (which silently lets the last
  // row with a given contact_id win), flag it as a mistake to fix: a genuine bulk-update file has
  // one row per contact, so two rows sharing a Code almost always means a copy-paste error, not
  // deliberate last-one-wins intent.
  const codeToFirstRow = new Map<string, number>();
  for (const { rowNumber, data } of parsed) {
    if (!data.code) continue;
    const firstRow = codeToFirstRow.get(data.code);
    if (firstRow) errors.push(`Row ${rowNumber}: Code "${data.code}" is duplicated with row ${firstRow}`);
    else codeToFirstRow.set(data.code, rowNumber);
  }

  // Resolve "Code" -> an existing customer (update target) or undefined (create new).
  const codes = [...new Set(parsed.map((p) => p.data.code).filter((c): c is string => Boolean(c)))];
  const existingByCode = codes.length > 0 ? await prisma.customer.findMany({ where: { organizationId, code: { in: codes } }, select: { id: true, code: true } }) : [];
  const codeToExistingId = new Map(existingByCode.map((c) => [c.code, c.id]));

  // Duplicate phone numbers within the file itself - two DIFFERENT target customers (one row
  // updating an existing customer, or two "create" rows) can never share a phone.
  const phoneToFirstRow = new Map<string, number>();
  for (const { rowNumber, data } of parsed) {
    const targetId = data.code ? codeToExistingId.get(data.code) : undefined;
    const key = targetId ?? data.phone; // two rows updating the SAME existing customer share a "target", not a phone collision
    const firstRow = phoneToFirstRow.get(key);
    if (firstRow) errors.push(`Row ${rowNumber}: phone ${data.phone} is duplicated with row ${firstRow}`);
    else phoneToFirstRow.set(key, rowNumber);
  }

  // Duplicate phone numbers against existing customers - excluding the row's own update target,
  // so re-importing a customer's own unchanged phone number doesn't block the update.
  if (parsed.length > 0) {
    const existingByPhone = await prisma.customer.findMany({
      where: { organizationId, deletedAt: null, phone: { in: parsed.map((p) => p.data.phone) } },
      select: { id: true, phone: true },
    });
    const phoneToOwnerId = new Map(existingByPhone.map((c) => [c.phone, c.id]));
    for (const { rowNumber, data } of parsed) {
      const targetId = data.code ? codeToExistingId.get(data.code) : undefined;
      const ownerId = phoneToOwnerId.get(data.phone);
      if (ownerId && ownerId !== targetId) errors.push(`Row ${rowNumber}: a customer with phone ${data.phone} already exists`);
    }
  }

  // Resolve "Customer Group" / "Selling Price Group" / "Invoice Layout" / "Business Location"
  // names to ids - same strict "error if given but not found" validation Customer Group already
  // had (the reference itself silently leaves these null when unmatched instead of erroring, but
  // this feature's own established convention is to surface every problem up front, not silently
  // drop a value the importer clearly intended).
  const groupNameToId = new Map<string, string>();
  const groupNames = [...new Set(parsed.map((p) => p.data.customerGroupName).filter((n): n is string => Boolean(n)))];
  if (groupNames.length > 0) {
    const groups = await prisma.customerGroup.findMany({ where: { organizationId }, select: { id: true, nameEn: true } });
    for (const g of groups) groupNameToId.set(g.nameEn.toLowerCase(), g.id);
    for (const { rowNumber, data } of parsed) {
      if (data.customerGroupName && !groupNameToId.has(data.customerGroupName.toLowerCase())) {
        errors.push(`Row ${rowNumber}: customer group "${data.customerGroupName}" was not found`);
      }
    }
  }

  const priceListNameToId = new Map<string, string>();
  const priceListNames = [...new Set(parsed.map((p) => p.data.priceListName).filter((n): n is string => Boolean(n)))];
  if (priceListNames.length > 0) {
    const lists = await prisma.priceList.findMany({ where: { organizationId }, select: { id: true, nameEn: true } });
    for (const l of lists) priceListNameToId.set(l.nameEn.toLowerCase(), l.id);
    for (const { rowNumber, data } of parsed) {
      if (data.priceListName && !priceListNameToId.has(data.priceListName.toLowerCase())) {
        errors.push(`Row ${rowNumber}: selling price group "${data.priceListName}" was not found`);
      }
    }
  }

  const invoiceLayoutNameToId = new Map<string, string>();
  const invoiceLayoutNames = [...new Set(parsed.map((p) => p.data.invoiceLayoutName).filter((n): n is string => Boolean(n)))];
  if (invoiceLayoutNames.length > 0) {
    const layouts = await prisma.invoiceLayoutSettings.findMany({
      where: { businessLocation: { organizationId } },
      select: { id: true, name: true },
    });
    for (const l of layouts) invoiceLayoutNameToId.set(l.name.toLowerCase(), l.id);
    for (const { rowNumber, data } of parsed) {
      if (data.invoiceLayoutName && !invoiceLayoutNameToId.has(data.invoiceLayoutName.toLowerCase())) {
        errors.push(`Row ${rowNumber}: invoice layout "${data.invoiceLayoutName}" was not found`);
      }
    }
  }

  const locationNameToId = new Map<string, string>();
  const locationNames = [...new Set(parsed.map((p) => p.data.businessLocationName).filter((n): n is string => Boolean(n)))];
  if (locationNames.length > 0) {
    const locations = await prisma.businessLocation.findMany({ where: { organizationId }, select: { id: true, branchName: true } });
    for (const l of locations) locationNameToId.set(l.branchName.toLowerCase(), l.id);
    for (const { rowNumber, data } of parsed) {
      if (data.businessLocationName && !locationNameToId.has(data.businessLocationName.toLowerCase())) {
        errors.push(`Row ${rowNumber}: business location "${data.businessLocationName}" was not found`);
      }
    }
  }

  if (errors.length > 0) return { imported: 0, errors };

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { customerApprovalRequired: true } });
  const approvalStatus = org?.customerApprovalRequired ? "PENDING" : "APPROVED";

  let nextCount = await prisma.customer.count({ where: { organizationId } });
  await prisma.$transaction(
    async (tx) => {
      for (const { data } of parsed) {
        const payload = {
          nameEn: data.nameEn,
          nameAr: data.nameAr,
          contactType: data.contactType,
          prefix: data.prefix,
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          businessName: data.businessName,
          dateOfBirth: data.dateOfBirth,
          phone: data.phone,
          altPhone: data.altPhone,
          landline: data.landline,
          email: data.email,
          customerGroupId: data.customerGroupName ? groupNameToId.get(data.customerGroupName.toLowerCase()) : undefined,
          priceListId: data.priceListName ? priceListNameToId.get(data.priceListName.toLowerCase()) : undefined,
          defaultInvoiceLayoutId: data.invoiceLayoutName ? invoiceLayoutNameToId.get(data.invoiceLayoutName.toLowerCase()) : undefined,
          businessLocationId: data.businessLocationName ? locationNameToId.get(data.businessLocationName.toLowerCase()) : undefined,
          address: data.address,
          addressLine2: data.addressLine2,
          city: data.city,
          district: data.district,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode,
          buildingNo: data.buildingNo,
          additionalNo: data.additionalNo,
          idType: data.idType,
          vatNumber: data.vatNumber,
          crNumber: data.crNumber,
          nationalAddress: data.nationalAddress,
          notes: data.notes,
          creditLimit: data.creditLimit,
          paymentTermsDays: data.paymentTermsDays,
          customField1: data.customField1,
          customField2: data.customField2,
          customField3: data.customField3,
          customField4: data.customField4,
          customField5: data.customField5,
          customField6: data.customField6,
          customField7: data.customField7,
          customField8: data.customField8,
          customField9: data.customField9,
          customField10: data.customField10,
        };

        const existingId = data.code ? codeToExistingId.get(data.code) : undefined;
        if (existingId) {
          await tx.customer.update({ where: { id: existingId }, data: payload });
        } else {
          nextCount += 1;
          await tx.customer.create({
            data: {
              ...payload,
              organizationId,
              code: data.code || `CUST-${String(nextCount).padStart(5, "0")}`,
              openingBalance: data.openingBalance,
              balance: data.openingBalance,
              approvalStatus,
            },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  return { imported: parsed.length, errors: [] };
}
