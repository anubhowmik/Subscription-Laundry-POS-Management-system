import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import type { ParsedSheet } from "../../utils/spreadsheet";
import { mapSheetRows } from "../../utils/spreadsheet";
import { CONTACT_HEADER_MAP, parseContactRow, type ParsedContactRow } from "../../utils/contactImport";

const SORTABLE_FIELDS = ["nameEn", "createdAt", "balance"];

/**
 * "Total Purchase Due"/"Total Purchase Return Due" - matching the EJADA reference's Suppliers
 * list, which shows these as two separate, freshly-computed columns from actual purchase/return
 * transaction sums, distinct from the supplier's own stored `balance` field (shown as "Advance
 * Balance" - see SuppliersPage.tsx). Computed via a grouped aggregate rather than stored, so it's
 * always exactly right regardless of how `balance` itself gets adjusted elsewhere.
 */
async function attachPurchaseDue<T extends { id: string }>(
  suppliers: T[],
): Promise<(T & { totalPurchaseDue: number; totalPurchaseReturnDue: number })[]> {
  if (suppliers.length === 0) return [];
  const ids = suppliers.map((s) => s.id);
  const [purchaseAgg, returnAgg] = await Promise.all([
    prisma.purchase.groupBy({ by: ["supplierId"], where: { supplierId: { in: ids } }, _sum: { totalAmount: true, paidAmount: true } }),
    prisma.purchaseReturn.groupBy({ by: ["supplierId"], where: { supplierId: { in: ids } }, _sum: { totalAmount: true, refundedAmount: true } }),
  ]);
  const dueMap = new Map(purchaseAgg.map((p) => [p.supplierId, Number(p._sum.totalAmount ?? 0) - Number(p._sum.paidAmount ?? 0)]));
  const returnDueMap = new Map(returnAgg.map((r) => [r.supplierId, Number(r._sum.totalAmount ?? 0) - Number(r._sum.refundedAmount ?? 0)]));
  return suppliers.map((s) => ({
    ...s,
    totalPurchaseDue: dueMap.get(s.id) ?? 0,
    totalPurchaseReturnDue: returnDueMap.get(s.id) ?? 0,
  }));
}

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");

  const where: Prisma.SupplierWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    // "Advance Balance"/"Opening Balance" filter checkboxes - see SuppliersPage.tsx's filter row,
    // matching the reference's own Suppliers filters exactly.
    ...(query.hasAdvanceBalance === "true" ? { balance: { gt: 0 } } : {}),
    ...(query.hasOpeningBalance === "true" ? { openingBalance: { gt: 0 } } : {}),
    ...(query.search
      ? {
          OR: [
            { nameEn: { contains: String(query.search), mode: "insensitive" } },
            { nameAr: { contains: String(query.search) } },
            { phone: { contains: String(query.search) } },
            { code: { contains: String(query.search), mode: "insensitive" } },
            { email: { contains: String(query.search), mode: "insensitive" } },
            // The reference's own search box matches address fields too, not just name/phone/code.
            { address: { contains: String(query.search), mode: "insensitive" } },
            { city: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const needsDueFilter = query.hasPurchaseDue === "true" || query.hasPurchaseReturn === "true";

  if (!needsDueFilter) {
    const [data, total] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy, skip, take: limit }),
      prisma.supplier.count({ where }),
    ]);
    return { data: await attachPurchaseDue(data), meta: { page, limit, total } };
  }

  // "Purchase Due"/"Purchase Return" are computed, not stored, so they can't be pushed into the
  // SQL WHERE clause the way the other filters are - fetch every matching supplier, compute,
  // filter, THEN paginate in memory. Fine at the scale a laundry business's supplier list
  // actually reaches (tens to low hundreds, not millions).
  const all = await prisma.supplier.findMany({ where, orderBy });
  const withDue = await attachPurchaseDue(all);
  const filtered = withDue.filter((s) => {
    if (query.hasPurchaseDue === "true" && !(s.totalPurchaseDue > 0)) return false;
    if (query.hasPurchaseReturn === "true" && !(s.totalPurchaseReturnDue > 0)) return false;
    return true;
  });
  return { data: filtered.slice(skip, skip + limit), meta: { page, limit, total: filtered.length } };
}

export async function getById(id: string, organizationId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: { contactPersons: true },
  });
  if (!supplier) throw new NotFoundError("Supplier not found");
  return supplier;
}

type ContactPersonInput = Omit<Prisma.SupplierContactPersonUncheckedCreateInput, "id" | "supplierId" | "createdAt" | "updatedAt">;

async function generateSupplierCode(organizationId: string): Promise<string> {
  const count = await prisma.supplier.count({ where: { organizationId } });
  return `SUP-${String(count + 1).padStart(5, "0")}`;
}

export async function create(
  input: Omit<Prisma.SupplierUncheckedCreateInput, "organizationId" | "balance"> & { contactPersons?: ContactPersonInput[]; dateOfBirth?: string | Date | null },
  organizationId: string,
) {
  const { contactPersons, dateOfBirth, ...rest } = input;
  const existing = await prisma.supplier.findFirst({ where: { organizationId, phone: rest.phone as string, deletedAt: null } });
  if (existing) throw new ConflictError("A supplier with this phone number already exists");

  const openingBalance = rest.openingBalance ?? 0;
  const dob = dateOfBirth ? new Date(dateOfBirth) : undefined;
  const contactPersonsCreate = contactPersons?.length ? { create: contactPersons } : undefined;

  // A user-provided "Contact ID" (see createSupplierSchema's `code`) is used verbatim - matching
  // the reference app's own "leave empty to autogenerate" Contact ID field - and its uniqueness
  // is enforced by the existing @@unique([organizationId, code]) constraint (surfaces as a 409
  // via errorHandler.ts's generic P2002 handling). Only fall back to the auto-generated
  // SUP-00001 scheme, with its collision-retry loop, when nothing was typed in.
  if (rest.code) {
    return prisma.supplier.create({
      data: { ...rest, code: rest.code, organizationId, openingBalance, balance: openingBalance, dateOfBirth: dob, contactPersons: contactPersonsCreate },
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await generateSupplierCode(organizationId);
    try {
      return await prisma.supplier.create({
        data: { ...rest, code, organizationId, openingBalance, balance: openingBalance, dateOfBirth: dob, contactPersons: contactPersonsCreate },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 4) {
        continue; // code collision under concurrent writes - retry with a fresh count
      }
      throw err;
    }
  }
  throw new Error("Failed to generate a unique supplier code");
}

export async function update(
  id: string,
  input: Omit<Prisma.SupplierUncheckedUpdateInput, "dateOfBirth"> & { contactPersons?: ContactPersonInput[]; dateOfBirth?: string | Date | null },
  organizationId: string,
) {
  await getById(id, organizationId);
  const { contactPersons, dateOfBirth, ...rest } = input;
  return prisma.supplier.update({
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
  return prisma.supplier.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function activate(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.supplier.update({ where: { id }, data: { status: "ACTIVE" } });
}

export async function getProfile(id: string, organizationId: string) {
  const supplier = await getById(id, organizationId);
  const [purchases, purchaseReturns] = await Promise.all([
    prisma.purchase.findMany({ where: { supplierId: id, organizationId }, orderBy: { purchaseDate: "desc" }, take: 20 }),
    prisma.purchaseReturn.findMany({ where: { supplierId: id, organizationId }, orderBy: { returnDate: "desc" }, take: 20 }),
  ]);
  return { supplier, purchases, purchaseReturns };
}

export interface ImportResult {
  imported: number;
  errors: string[];
}

/** All-or-nothing, same reasoning as customer.service.ts's importCustomers - every row is
 * validated (including duplicate-phone checks) before anything is written, and any failure
 * returns the FULL list of problems rather than aborting at the first one. */
/**
 * Same all-or-nothing validation + upsert-by-Code semantics as `importCustomers()` - see its
 * comment for the reasoning (this is the reference's shared Contact import behavior, converted
 * once and reused by both Customer and Supplier since the reference's own Contact model backs
 * both too). Suppliers don't get Customer Group/Selling Price Group/Invoice Layout resolution
 * (those are customer-only concepts, per the reference's own field placement), but do get
 * Business Location resolution, which the reference applies to both contact types.
 */
export async function importSuppliers(sheet: ParsedSheet, organizationId: string): Promise<ImportResult> {
  const rawRows = mapSheetRows(sheet, CONTACT_HEADER_MAP);
  if (rawRows.length === 0) throw new AppError(400, "No data rows found in the uploaded file");

  const errors: string[] = [];
  const parsed: { rowNumber: number; data: ParsedContactRow }[] = [];
  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const result = parseContactRow(raw, rowNumber);
    if ("error" in result) errors.push(result.error);
    else parsed.push({ rowNumber, data: result.data });
  });

  const codeToFirstRow = new Map<string, number>();
  for (const { rowNumber, data } of parsed) {
    if (!data.code) continue;
    const firstRow = codeToFirstRow.get(data.code);
    if (firstRow) errors.push(`Row ${rowNumber}: Code "${data.code}" is duplicated with row ${firstRow}`);
    else codeToFirstRow.set(data.code, rowNumber);
  }

  const codes = [...new Set(parsed.map((p) => p.data.code).filter((c): c is string => Boolean(c)))];
  const existingByCode = codes.length > 0 ? await prisma.supplier.findMany({ where: { organizationId, code: { in: codes } }, select: { id: true, code: true } }) : [];
  const codeToExistingId = new Map(existingByCode.map((s) => [s.code, s.id]));

  const phoneToFirstRow = new Map<string, number>();
  for (const { rowNumber, data } of parsed) {
    const targetId = data.code ? codeToExistingId.get(data.code) : undefined;
    const key = targetId ?? data.phone;
    const firstRow = phoneToFirstRow.get(key);
    if (firstRow) errors.push(`Row ${rowNumber}: phone ${data.phone} is duplicated with row ${firstRow}`);
    else phoneToFirstRow.set(key, rowNumber);
  }

  if (parsed.length > 0) {
    const existingByPhone = await prisma.supplier.findMany({
      where: { organizationId, deletedAt: null, phone: { in: parsed.map((p) => p.data.phone) } },
      select: { id: true, phone: true },
    });
    const phoneToOwnerId = new Map(existingByPhone.map((s) => [s.phone, s.id]));
    for (const { rowNumber, data } of parsed) {
      const targetId = data.code ? codeToExistingId.get(data.code) : undefined;
      const ownerId = phoneToOwnerId.get(data.phone);
      if (ownerId && ownerId !== targetId) errors.push(`Row ${rowNumber}: a supplier with phone ${data.phone} already exists`);
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

  let nextCount = await prisma.supplier.count({ where: { organizationId } });
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
          await tx.supplier.update({ where: { id: existingId }, data: payload });
        } else {
          nextCount += 1;
          await tx.supplier.create({
            data: {
              ...payload,
              organizationId,
              code: data.code || `SUP-${String(nextCount).padStart(5, "0")}`,
              openingBalance: data.openingBalance,
              balance: data.openingBalance,
            },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  return { imported: parsed.length, errors: [] };
}
