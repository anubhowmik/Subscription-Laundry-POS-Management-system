import { createHmac, randomInt } from "crypto";
import { Prisma, type Coupon, type CouponSource } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { sendSms } from "../notifications/notifications.service";
import { AppError, ConflictError, NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";
import type { ParsedSheet } from "../../utils/spreadsheet";
import { formOptions as promotionFormOptions } from "../promotions/promotion.service";
import { COUPON_DAYS, couponInactiveReason, couponPeriods } from "./couponEngine";
import { bulkCouponSchema, createCouponSchema, updateCouponSchema } from "./coupon.validators";

const { Decimal } = Prisma;

type CouponInput = z.infer<typeof createCouponSchema>;
type BulkCouponInput = z.infer<typeof bulkCouponSchema>;
type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
type Fields = Omit<CouponInput, "code">;

/**
 * Promotions > Coupons, translated from the EJADA reference CouponController + coupon views:
 * list (Name, Coupon, Starts At, Ends At, Days, Periods), Add, Add Bulk (generated codes), Edit,
 * Delete (soft), Reactivate, Deactivate Selected and Import Coupons. How a coupon is checked and
 * applied at the POS lives in couponEngine.ts / resolveCartCoupon() below.
 */

// ---------------------------------------------------------------------------------------------
// List / options
// ---------------------------------------------------------------------------------------------

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const search = query.search ? String(query.search).trim() : "";
  const where: Prisma.CouponWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    ...(search
      ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }] }
      : {}),
  };
  const [data, total] = await Promise.all([
    // Reference index(): newest first.
    prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.coupon.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const coupon = await prisma.coupon.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!coupon) throw new NotFoundError("Coupon not found");
  const customerIds = [...new Set([...coupon.customerIds, ...coupon.excludeCustomerIds])];
  const customers = customerIds.length
    ? await prisma.customer.findMany({ where: { id: { in: customerIds }, organizationId }, select: { id: true, code: true, nameEn: true, nameAr: true, phone: true } })
    : [];
  return { ...coupon, customers };
}

/** The coupon form's pickers - the same catalog lists the promotion form uses (no price lists). */
export async function formOptions(organizationId: string) {
  const { priceLists: _priceLists, ...rest } = await promotionFormOptions(organizationId);
  return { ...rest, days: COUPON_DAYS };
}

// ---------------------------------------------------------------------------------------------
// Create / bulk / update / delete / activate
// ---------------------------------------------------------------------------------------------

/** Every id the form sends must belong to this organization - never trust a client-sent reference. */
async function assertRefsInOrg(input: Pick<Fields, "locationGroupIds" | "businessLocationIds" | "customerGroupIds" | "customerIds" | "excludeCustomerIds" | "brandIds" | "categoryKeys" | "itemKeys">, organizationId: string) {
  const ofPrefix = (keys: string[], prefix: string) => keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const checks: [string, string[], (ids: string[]) => Promise<number>][] = [
    ["locationGroupIds", input.locationGroupIds, (ids) => prisma.businessLocationGroup.count({ where: { id: { in: ids }, organizationId } })],
    ["businessLocationIds", input.businessLocationIds, (ids) => prisma.businessLocation.count({ where: { id: { in: ids }, organizationId } })],
    ["customerGroupIds", input.customerGroupIds, (ids) => prisma.customerGroup.count({ where: { id: { in: ids }, organizationId } })],
    ["customerIds", input.customerIds, (ids) => prisma.customer.count({ where: { id: { in: ids }, organizationId } })],
    ["excludeCustomerIds", input.excludeCustomerIds, (ids) => prisma.customer.count({ where: { id: { in: ids }, organizationId } })],
    ["brandIds", input.brandIds, (ids) => prisma.brand.count({ where: { id: { in: ids }, organizationId } })],
    ["categoryKeys", ofPrefix(input.categoryKeys, "pc:"), (ids) => prisma.category.count({ where: { id: { in: ids }, organizationId } })],
    ["categoryKeys", ofPrefix(input.categoryKeys, "sc:"), (ids) => prisma.serviceCategory.count({ where: { id: { in: ids }, organizationId } })],
    ["itemKeys", ofPrefix(input.itemKeys, "p:"), (ids) => prisma.product.count({ where: { id: { in: ids }, organizationId } })],
    ["itemKeys", ofPrefix(input.itemKeys, "s:"), (ids) => prisma.service.count({ where: { id: { in: ids }, organizationId } })],
  ];
  for (const [field, list, count] of checks) {
    const unique = [...new Set(list)];
    if (unique.length && (await count(unique)) !== unique.length) throw new AppError(400, `Unknown value in ${field}`);
  }
}

const dateOrNull = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : null);

function dataOf(input: Fields) {
  return {
    name: input.name,
    minPurchaseAmount: new Decimal(input.minPurchaseAmount ?? 0),
    maxUsesPerCustomer: input.maxUsesPerCustomer ?? null,
    maxUses: input.maxUses ?? null,
    locationGroupIds: input.locationGroupIds,
    businessLocationIds: input.businessLocationIds,
    customerGroupIds: input.customerGroupIds,
    customerIds: input.customerIds,
    excludeCustomerIds: input.excludeCustomerIds,
    categoryKeys: input.categoryKeys,
    brandIds: input.brandIds,
    itemKeys: input.itemKeys,
    validFrom: dateOrNull(input.validFrom),
    validUntil: dateOrNull(input.validUntil),
    days: input.days,
    periods: input.periods.length ? (input.periods as Prisma.InputJsonValue) : Prisma.JsonNull,
    discountMode: input.discountMode,
    discountValue: new Decimal(input.discountValue),
    maxDiscountAmount: input.maxDiscountAmount ?? null,
    isActive: input.isActive,
    addedDiscount: input.addedDiscount,
    otp: input.otp,
  };
}

async function assertCodeFree(organizationId: string, code: string, exceptId?: string) {
  // Reference: a code is unique even against deleted coupons (`coupons.coupon` unique index).
  const existing = await prisma.coupon.findFirst({ where: { organizationId, code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (existing) throw new ConflictError("Coupon already Exist!");
}

export async function create(input: CouponInput, organizationId: string, createdBy: string | null, source: CouponSource = "SINGLE") {
  await assertCodeFree(organizationId, input.code);
  await assertRefsInOrg(input, organizationId);
  return prisma.coupon.create({ data: { organizationId, code: input.code, ...dataOf(input), addedBy: source, createdBy } });
}

const ALPHABET = { NUMBERS: "0123456789", LETTERS: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", MIXED: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" } as const;

/** Reference generateRandomString(): prefix + N random digits / letters. */
export function randomCode(length: number, prefix = "", type: keyof typeof ALPHABET = "MIXED") {
  const chars = ALPHABET[type];
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return `${prefix}${out}`.toUpperCase();
}

/** Reference "Add Bulk": `count` coupons sharing every setting, each with a generated code. */
export async function createBulk(input: BulkCouponInput, organizationId: string, createdBy: string) {
  const { count, prefix, digits, digitsType, ...fields } = input;
  await assertRefsInOrg(fields, organizationId);
  const space = ALPHABET[digitsType].length ** digits;
  if (count > space / 2) throw new AppError(400, "Use more digits - there aren't enough different codes for that many coupons");
  const taken = new Set(
    (await prisma.coupon.findMany({ where: { organizationId, code: { startsWith: prefix.toUpperCase() } }, select: { code: true } })).map((c) => c.code),
  );
  const codes: string[] = [];
  while (codes.length < count) {
    const candidate = randomCode(digits, prefix, digitsType);
    if (taken.has(candidate)) continue;
    taken.add(candidate);
    codes.push(candidate);
  }
  const data = dataOf(fields);
  await prisma.coupon.createMany({ data: codes.map((code) => ({ organizationId, code, ...data, addedBy: "BULK" as const, createdBy })) });
  return { created: codes.length, codes };
}

export async function update(id: string, input: UpdateCouponInput, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Coupon not found");
  await assertCodeFree(organizationId, input.code, id);
  await assertRefsInOrg(input, organizationId);
  return prisma.coupon.update({ where: { id }, data: { code: input.code, ...dataOf(input) } });
}

/** Reference destroy(): soft delete - past invoices keep their coupon. */
export async function remove(id: string, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Coupon not found");
  return prisma.coupon.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

export async function activate(id: string, organizationId: string) {
  const existing = await prisma.coupon.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (!existing) throw new NotFoundError("Coupon not found");
  return prisma.coupon.update({ where: { id }, data: { isActive: true } });
}

export async function massDeactivate(ids: string[], organizationId: string) {
  const { count } = await prisma.coupon.updateMany({ where: { id: { in: ids }, organizationId, deletedAt: null }, data: { isActive: false } });
  return { deactivated: count };
}

/** Compensations > resolve as Coupon: a single-use fixed coupon for that one customer. */
export async function createCompensationCoupon(args: { organizationId: string; customerId: string; amount: number; code: string; compensationRef: string; createdBy: string }) {
  return prisma.coupon.create({
    data: {
      organizationId: args.organizationId,
      code: args.code,
      name: `Compensation ${args.compensationRef}`,
      discountMode: "FIXED",
      discountValue: new Decimal(args.amount),
      maxUses: 1,
      customerIds: [args.customerId],
      createdBy: args.createdBy,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Import (reference importCoupons + coupon/import.blade.php template)
// ---------------------------------------------------------------------------------------------

/** The reference template's 22 columns, by header. */
export const IMPORT_COLUMNS = [
  ["coupon name", "name"],
  ["coupon code", "code"],
  ["sales amount", "salesAmount"],
  ["customer limit", "customerLimit"],
  ["coupon limit", "couponLimit"],
  ["location groups", "locationGroups"],
  ["locations", "locations"],
  ["customer groups", "customerGroups"],
  ["customers", "customers"],
  ["exclude customers", "excludeCustomers"],
  ["product categories", "categories"],
  ["product brands", "brands"],
  ["products", "products"],
  ["starts at", "startsAt"],
  ["ends at", "endsAt"],
  ["days", "days"],
  ["times", "times"],
  ["discount type", "discountType"],
  ["discount amount", "discountAmount"],
  ["max discount", "maxDiscount"],
  ["added discount", "addedDiscount"],
  ["is active", "isActive"],
] as const;

const splitList = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** "20-8-2022", "2022-08-20" or a spreadsheet date cell -> "YYYY-MM-DD". */
function importDay(v: string): string | null {
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "10:00-11:00,12:00-01:00" -> [{from,to}] */
function importTimes(v: string) {
  return splitList(v).map((range) => {
    const [from, to] = range.split("-").map((x) => x.trim());
    const norm = (t: string | undefined) => (t && /^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : null);
    return { from: norm(from), to: norm(to) };
  });
}

/**
 * Reference importCoupons(): every row is checked first; any error rejects the whole file (the
 * reference rolled the transaction back), otherwise all rows are created with addedBy = Excel.
 * Names are matched like the reference: groups / branches / customer groups / categories / brands
 * by name, customers by contact code, products by SKU (services by code).
 */
export async function importCoupons(sheet: ParsedSheet, organizationId: string, createdBy: string) {
  const headerToKey = Object.fromEntries(IMPORT_COLUMNS);
  const missing = IMPORT_COLUMNS.filter(([h]) => !sheet.headers.includes(h)).map(([h]) => h);
  if (missing.length) throw new AppError(400, `Some of the columns are missing (${missing.join(", ")}). Please use the latest template file.`);
  const indexToKey = sheet.headers.map((h) => headerToKey[h]);
  const rows = sheet.rows.map((row) => {
    const rec: Record<string, string> = {};
    row.forEach((v, i) => indexToKey[i] && (rec[indexToKey[i]] = v));
    return rec;
  });

  const [groups, locations, customerGroups, categories, serviceCategories, brands, products, services, existingCodes] = await Promise.all([
    prisma.businessLocationGroup.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.businessLocation.findMany({ where: { organizationId }, select: { id: true, branchName: true, branchNameAr: true, branchCode: true } }),
    prisma.customerGroup.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.category.findMany({ where: { organizationId, parentId: null }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.serviceCategory.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.brand.findMany({ where: { organizationId }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.product.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, sku: true } }),
    prisma.service.findMany({ where: { organizationId }, select: { id: true, code: true } }),
    prisma.coupon.findMany({ where: { organizationId }, select: { code: true } }),
  ]);
  const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const byName = <T extends { nameEn: string; nameAr: string | null }>(list: T[], name: string) => list.find((x) => lower(x.nameEn) === lower(name) || lower(x.nameAr) === lower(name));
  const codes = new Set(existingCodes.map((c) => c.code));
  const customerCodes = [...new Set(rows.flatMap((r) => [...splitList(r.customers), ...splitList(r.excludeCustomers)]))];
  const customers = customerCodes.length ? await prisma.customer.findMany({ where: { organizationId, code: { in: customerCodes } }, select: { id: true, code: true } }) : [];

  const errors: { row: number; message: string }[] = [];
  const ready: { code: string; fields: Fields }[] = [];
  rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const fail = (message: string) => errors.push({ row: rowNo, message });
    const resolve = <T>(names: string[], find: (n: string) => T | undefined, label: string) => {
      const out: T[] = [];
      for (const n of names) {
        const hit = find(n);
        if (hit === undefined) fail(`${label} "${n}" not found`);
        else out.push(hit);
      }
      return out;
    };
    if (!r.name?.trim()) return fail("Coupon Name is required");
    const type = lower(r.discountType);
    if (type !== "fixed" && type !== "percentage") return fail("Discount Type must be fixed or percentage");
    const amount = Number(r.discountAmount);
    if (!r.discountAmount || !(amount > 0)) return fail("Discount Amount is required");
    if (type === "percentage" && amount > 100) return fail("A percentage can't be more than 100");
    let code = (r.code ?? "").trim().toUpperCase();
    if (code) {
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail(`Coupon Code "${code}" is not valid`);
      if (codes.has(code)) return fail(`Duplicated Coupon Code "${code}"`);
    } else {
      do code = randomCode(6);
      while (codes.has(code));
    }
    codes.add(code);
    const days = splitList(r.days).map((d) => COUPON_DAYS.find((x) => x.toLowerCase() === d.toLowerCase().slice(0, 3)));
    if (days.some((d) => !d)) return fail("Days must be like Sat,Sun");
    const periods = importTimes(r.times);
    if (periods.some((p) => !p.from || !p.to)) return fail("Times must be like 10:00-11:00");
    const validFrom = importDay(r.startsAt);
    const validUntil = importDay(r.endsAt);
    if (r.startsAt && !validFrom) return fail("Starts At is not a date");
    if (r.endsAt && !validUntil) return fail("Ends At is not a date");
    const num = (v: string | undefined) => (v && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    const before = errors.length;
    const fields: Fields = {
      name: r.name.trim(),
      minPurchaseAmount: Math.max(0, num(r.salesAmount) ?? 0),
      maxUsesPerCustomer: num(r.customerLimit) ? Math.trunc(num(r.customerLimit)!) : null,
      maxUses: num(r.couponLimit) ? Math.trunc(num(r.couponLimit)!) : null,
      locationGroupIds: resolve(splitList(r.locationGroups), (n) => byName(groups, n)?.id, "Location group"),
      businessLocationIds: resolve(splitList(r.locations), (n) => locations.find((l) => lower(l.branchName) === lower(n) || lower(l.branchNameAr) === lower(n) || lower(l.branchCode) === lower(n))?.id, "Location"),
      customerGroupIds: resolve(splitList(r.customerGroups), (n) => byName(customerGroups, n)?.id, "Customer group"),
      customerIds: resolve(splitList(r.customers), (n) => customers.find((c) => lower(c.code) === lower(n))?.id, "Customer"),
      excludeCustomerIds: resolve(splitList(r.excludeCustomers), (n) => customers.find((c) => lower(c.code) === lower(n))?.id, "Customer"),
      categoryKeys: resolve(splitList(r.categories), (n) => {
        const pc = byName(categories, n);
        if (pc) return `pc:${pc.id}`;
        const sc = byName(serviceCategories, n);
        return sc ? `sc:${sc.id}` : undefined;
      }, "Category"),
      brandIds: resolve(splitList(r.brands), (n) => byName(brands, n)?.id, "Brand"),
      itemKeys: resolve(splitList(r.products), (n) => {
        const p = products.find((x) => lower(x.sku) === lower(n));
        if (p) return `p:${p.id}`;
        const s = services.find((x) => lower(x.code) === lower(n));
        return s ? `s:${s.id}` : undefined;
      }, "Product"),
      validFrom,
      validUntil,
      days: days as (typeof COUPON_DAYS)[number][],
      periods: periods as { from: string; to: string }[],
      discountMode: type === "fixed" ? "FIXED" : "PERCENT",
      discountValue: amount,
      maxDiscountAmount: num(r.maxDiscount) && num(r.maxDiscount)! > 0 ? num(r.maxDiscount) : null,
      // Reference template: Added Discount defaults to 0, Is Active to 1.
      addedDiscount: r.addedDiscount?.trim() === "1",
      isActive: r.isActive?.trim() === "" || r.isActive == null ? true : r.isActive.trim() === "1",
      otp: false,
    };
    if (errors.length === before) ready.push({ code, fields });
  });

  if (rows.length === 0) errors.push({ row: 0, message: "The file has no coupons" });
  if (errors.length) return { imported: 0, errors };
  await prisma.$transaction(
    ready.map(({ code, fields }) => prisma.coupon.create({ data: { organizationId, code, ...dataOf(fields), addedBy: "EXCEL", createdBy } })),
  );
  return { imported: ready.length, errors: [] };
}

// ---------------------------------------------------------------------------------------------
// POS: is this coupon usable for this cart's customer and branch?
// ---------------------------------------------------------------------------------------------

/**
 * Reference SellPosController@applyCoupon order: checkactiveCoupon (active, dates, days, times),
 * customer_limit, coupon_limit, then check_basic_conditions (branches incl. location groups,
 * customers incl. customer groups' members, excluded customers). The cart-amount and product
 * checks happen in couponEngine.fitCoupon on the priced lines.
 */
export async function resolveCartCoupon(
  tx: Prisma.TransactionClient,
  args: { organizationId: string; code: string; businessLocation: { id: string; groupId: string | null }; customer: { id: string; customerGroupId: string | null }; now?: Date },
): Promise<Coupon> {
  const coupon = await tx.coupon.findFirst({ where: { organizationId: args.organizationId, code: args.code.trim().toUpperCase(), deletedAt: null } });
  if (!coupon) throw new AppError(400, "Coupon code invalid");
  const inactive = couponInactiveReason(coupon, args.now);
  if (inactive) throw new AppError(400, inactive);

  if (coupon.maxUsesPerCustomer != null) {
    const used = await tx.sale.count({ where: { couponId: coupon.id, customerId: args.customer.id, status: "FINAL" } });
    if (used >= coupon.maxUsesPerCustomer) throw new AppError(400, "Customer reached max usage limit");
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new AppError(400, "Coupon reached max usage limit");

  if (coupon.excludeCustomerIds.includes(args.customer.id)) throw new AppError(400, "Conditions do not match");
  if (coupon.businessLocationIds.length || coupon.locationGroupIds.length) {
    const inGroup = args.businessLocation.groupId != null && coupon.locationGroupIds.includes(args.businessLocation.groupId);
    if (!coupon.businessLocationIds.includes(args.businessLocation.id) && !inGroup) throw new AppError(400, "Conditions do not match");
  }
  if (coupon.customerIds.length || coupon.customerGroupIds.length) {
    const inGroup = args.customer.customerGroupId != null && coupon.customerGroupIds.includes(args.customer.customerGroupId);
    if (!coupon.customerIds.includes(args.customer.id) && !inGroup) throw new AppError(400, "Conditions do not match");
  }
  return coupon;
}

// ---------------------------------------------------------------------------------------------
// OTP coupons (reference coupons.otp + the POS "Send OTP" button): before the coupon applies, the
// customer reads back a code sent to their mobile. The code is derived from the coupon, the
// customer and a 10-minute window (HMAC with the server secret), so nothing is stored and any
// server instance can check it; the current and previous window are accepted.
// ---------------------------------------------------------------------------------------------

const OTP_WINDOW_MS = 10 * 60 * 1000;

function otpFor(couponId: string, customerId: string, window: number) {
  const digest = createHmac("sha256", env.jwt.secret).update(`coupon-otp:${couponId}:${customerId}:${window}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function isValidCouponOtp(couponId: string, customerId: string, otp: string | undefined, now = Date.now()) {
  if (!otp) return false;
  const window = Math.floor(now / OTP_WINDOW_MS);
  return [window, window - 1].some((w) => otpFor(couponId, customerId, w) === otp.trim());
}

/** Sends the coupon's verification code to the customer's mobile (logged when no SMS provider is set up). */
export async function sendCouponOtp(args: { organizationId: string; code: string; businessLocation: { id: string; groupId: string | null }; customerId: string }) {
  const customer = await prisma.customer.findFirst({ where: { id: args.customerId, organizationId: args.organizationId, deletedAt: null }, select: { id: true, phone: true, customerGroupId: true } });
  if (!customer) throw new NotFoundError("Customer not found");
  const coupon = await prisma.$transaction((tx) =>
    resolveCartCoupon(tx, { organizationId: args.organizationId, code: args.code, businessLocation: args.businessLocation, customer }),
  );
  if (!coupon.otp) throw new AppError(400, "This coupon doesn't need a verification code");
  if (!customer.phone?.trim()) throw new AppError(400, "The customer has no mobile number for the verification code");
  const otp = otpFor(coupon.id, customer.id, Math.floor(Date.now() / OTP_WINDOW_MS));
  await sendSms(args.organizationId, customer.phone, `Your verification code for coupon ${coupon.code} is ${otp}`, "coupon_otp", coupon.id);
  const masked = customer.phone.length > 4 ? `${"*".repeat(customer.phone.length - 4)}${customer.phone.slice(-4)}` : customer.phone;
  // With no SMS provider set up the message is only logged (Notifications log); outside production
  // the code then comes back here so the cashier can still finish the sale while testing.
  const sms = await prisma.notificationSettings.findUnique({ where: { organizationId: args.organizationId }, select: { enabled: true, appSidEncrypted: true, senderId: true } });
  const smsLive = Boolean(sms?.enabled && sms.appSidEncrypted && sms.senderId);
  return { sentTo: masked, ...(!env.isProduction && !smsLive ? { devOtp: otp } : {}) };
}

/** For the coupon list's Periods column / forms. */
export const periodsOf = couponPeriods;
