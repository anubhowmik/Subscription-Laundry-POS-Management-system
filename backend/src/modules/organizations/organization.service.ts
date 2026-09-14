import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { logger } from "../../config/logger";
import { ConflictError, NotFoundError } from "../../utils/AppError";
import { ROLE_DEFS } from "../../config/defaultRoles";
import { PERMISSIONS } from "../../config/permissions";
import { PLAN_DEFS } from "../../config/plans";
import { generateVerificationCode } from "../auth/auth.service";
import { NOTIFICATION_TEMPLATE_DEFS } from "../../config/notificationTemplates";
import { seedDefaultChartOfAccounts } from "../accounting/account.service";
import { RegisterOrganizationInput } from "./organization.validators";

const SETTINGS_SELECT = {
  fiscalYearStartMonth: true,
  dateFormat: true,
  timeFormat24h: true,
  reportHeaderText: true,
  reportFooterText: true,
  logoUrl: true,
  themeColor: true,
  rewardPointsEnabled: true,
  rewardPointsName: true,
  pointValueSar: true,
  pointsEarnDivisor: true,
  minOrderForPoints: true,
  maxPointsPerOrder: true,
  minRedeemPoints: true,
  maxRedeemPoints: true,
  pointsExpiryDays: true,
  paymentReminderEnabled: true,
  paymentReminderAfterDays: true,
  paymentReminderIntervalDays: true,
  customerApprovalRequired: true,
  contactCustomField1Label: true,
  contactCustomField2Label: true,
  contactCustomField3Label: true,
  contactCustomField4Label: true,
  contactCustomField5Label: true,
  contactCustomField6Label: true,
  contactCustomField7Label: true,
  contactCustomField8Label: true,
  contactCustomField9Label: true,
  contactCustomField10Label: true,
  sellCustomField1Label: true,
  sellCustomField2Label: true,
  sellCustomField3Label: true,
  sellCustomField4Label: true,
} satisfies Prisma.OrganizationSelect;

export async function getSettings(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: SETTINGS_SELECT });
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

// Lighter-weight than getSettings() and gated only by authentication (not "settings.manage") -
// any user who can see a Supplier/Customer form needs these labels to render its custom fields,
// regardless of whether they're allowed to edit organization settings.
export async function getContactCustomFieldLabels(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      contactCustomField1Label: true,
      contactCustomField2Label: true,
      contactCustomField3Label: true,
      contactCustomField4Label: true,
      contactCustomField5Label: true,
      contactCustomField6Label: true,
      contactCustomField7Label: true,
      contactCustomField8Label: true,
      contactCustomField9Label: true,
      contactCustomField10Label: true,
    },
  });
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

// Same rationale as getContactCustomFieldLabels above, for the separate sell-level custom field
// config (reference's own `custom_labels['sell']` - 4 slots, distinct from the contact one).
export async function getSellCustomFieldLabels(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      sellCustomField1Label: true,
      sellCustomField2Label: true,
      sellCustomField3Label: true,
      sellCustomField4Label: true,
    },
  });
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export async function updateSettings(input: Partial<Prisma.OrganizationUpdateInput>, organizationId: string) {
  return prisma.organization.update({ where: { id: organizationId }, data: input, select: SETTINGS_SELECT });
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

async function generateUniqueSlug(nameEn: string): Promise<string> {
  const base = slugify(nameEn);
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Ensures the global Permission and Plan catalogs exist. Idempotent - safe to call every time.
 *  Always runs (not just when the table is empty) so a permission code added to PERMISSIONS after
 *  the first-ever registration still gets backfilled into the catalog - otherwise it can never be
 *  granted to any role, old or new, since registerOrganization() below only assigns permission IDs
 *  that already exist in this table. */
async function ensureGlobalCatalogsSeeded() {
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const planCount = await prisma.plan.count();
  if (planCount === 0) {
    await prisma.plan.createMany({
      data: PLAN_DEFS.map((p) => ({
        code: p.code,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        priceMonthly: p.priceMonthly,
        priceAnnual: p.priceAnnual,
        priceLifetime: p.priceLifetime,
        maxBranches: p.maxBranches,
        maxUsers: p.maxUsers,
      })),
      skipDuplicates: true,
    });
  }
}

export async function registerOrganization(input: RegisterOrganizationInput) {
  await ensureGlobalCatalogsSeeded();

  const [usernameTaken, emailTaken] = await Promise.all([
    prisma.user.findUnique({ where: { username: input.adminUsername } }),
    prisma.user.findUnique({ where: { email: input.adminEmail } }),
  ]);
  if (usernameTaken) throw new ConflictError("That username is already taken");
  if (emailTaken) throw new ConflictError("That email is already registered");

  const slug = await generateUniqueSlug(input.organizationNameEn);
  const allPermissions = await prisma.permission.findMany();
  const passwordHash = await bcrypt.hash(input.adminPassword, 12);

  const { organization, adminUser } = await prisma.$transaction(async (tx) => {
    // status stays the schema default (TRIAL) and trialEndsAt stays null - the trial clock does
    // not start at registration. It starts when the admin verifies their email (see
    // auth.service.ts verifyEmailCode(), which is also what creates the Subscription row below -
    // deliberately NOT created here). Until then, entitlement.service.ts's null-Subscription
    // "NO_SUBSCRIPTION" branch keeps every protected route blocked, and login() independently
    // blocks on emailVerified before a token is ever issued.
    const organization = await tx.organization.create({
      data: { nameEn: input.organizationNameEn, nameAr: input.organizationNameAr, slug },
    });

    // Every tenant gets its own copy of the default role set.
    let systemAdminRoleId = "";
    for (const roleDef of ROLE_DEFS) {
      const role = await tx.role.create({
        data: { organizationId: organization.id, nameEn: roleDef.nameEn, nameAr: roleDef.nameAr, isSystem: roleDef.isSystem ?? false },
      });
      if (roleDef.nameEn === "System Admin") systemAdminRoleId = role.id;

      const codes = roleDef.permissions === "ALL" ? allPermissions.map((p) => p.code) : roleDef.permissions;
      const permissionIds = allPermissions.filter((p) => codes.includes(p.code)).map((p) => p.id);
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    }

    const adminUser = await tx.user.create({
      data: {
        organizationId: organization.id,
        username: input.adminUsername,
        email: input.adminEmail,
        passwordHash,
        fullNameEn: input.adminFullNameEn,
        fullNameAr: input.adminFullNameAr,
        phone: input.adminPhone,
        roleId: systemAdminRoleId,
        isSystemAdmin: true,
      },
    });

    const mainBranch = await tx.businessLocation.create({
      data: {
        organizationId: organization.id,
        businessNameEn: input.organizationNameEn,
        businessNameAr: input.organizationNameAr,
        branchName: input.branchName ?? "Main Branch",
        branchCode: "MAIN",
        currency: "SAR",
        timezone: "Asia/Riyadh",
      },
    });

    await tx.userBusinessLocation.create({ data: { userId: adminUser.id, businessLocationId: mainBranch.id } });

    // Minimal default master data so the new tenant can start using POS immediately.
    await tx.unit.create({ data: { organizationId: organization.id, nameEn: "Piece", nameAr: "قطعة", shortName: "Pc" } });
    await tx.tax.create({
      data: { organizationId: organization.id, nameEn: "VAT", nameAr: "ضريبة القيمة المضافة", percentage: 15, taxType: "VAT" },
    });
    const walkInGroup = await tx.customerGroup.create({
      data: { organizationId: organization.id, nameEn: "Walk-in Customer", nameAr: "عميل نقدي", discountPercent: 0 },
    });
    await tx.customer.create({
      data: {
        organizationId: organization.id,
        code: "WALKIN",
        nameEn: "Walk-in Customer",
        nameAr: "عميل نقدي",
        phone: "0500000000",
        customerGroupId: walkInGroup.id,
        businessLocationId: mainBranch.id,
      },
    });
    await tx.paymentMethod.createMany({
      data: [
        { organizationId: organization.id, nameEn: "Cash", nameAr: "نقدي", code: "CASH" },
        { organizationId: organization.id, nameEn: "Card", nameAr: "بطاقة", code: "CARD" },
        { organizationId: organization.id, nameEn: "Online Payment", nameAr: "دفع إلكتروني", code: "ONLINE" },
        { organizationId: organization.id, nameEn: "Store Credit", nameAr: "رصيد المتجر", code: "STORE_CREDIT" },
        { organizationId: organization.id, nameEn: "Cashback", nameAr: "رصيد الكاش باك", code: "CASHBACK" },
        { organizationId: organization.id, nameEn: "Tamara", nameAr: "تمارا", code: "BNPL_TAMARA" },
        { organizationId: organization.id, nameEn: "Tabby", nameAr: "تابي", code: "BNPL_TABBY" },
        { organizationId: organization.id, nameEn: "MISPay", nameAr: "ميسباي", code: "BNPL_MISPAY" },
      ],
    });

    await tx.notificationTemplate.createMany({
      data: NOTIFICATION_TEMPLATE_DEFS.map((def) => ({ organizationId: organization.id, ...def })),
    });

    await seedDefaultChartOfAccounts(tx, organization.id);

    return { organization, adminUser };
  });

  // The account itself is already committed at this point - a failure to actually deliver the
  // confirmation email (provider outage, a not-yet-verified sending domain, etc.) must not turn
  // into a failed registration with no account and a confusing "something went wrong" error.
  // The code row is still created either way (see generateVerificationCode), so the "Resend"
  // button on the waiting screen works to retry delivery once the underlying issue is fixed.
  let verificationCode: string | undefined;
  try {
    verificationCode = (await generateVerificationCode(adminUser.id)).code;
  } catch (err) {
    logger.error({ err, userId: adminUser.id }, "Failed to send the initial verification email - account was still created");
  }

  return { organization, adminUser, verificationCode };
}
