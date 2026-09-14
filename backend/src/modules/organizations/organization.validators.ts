import { z } from "zod";
import { saudiPhoneSchema } from "../../utils/validators";

export const registerOrganizationSchema = z.object({
  organizationNameEn: z.string().min(1, "Required"),
  organizationNameAr: z.string().min(1, "Required"),
  adminUsername: z.string().min(3, "Username must be at least 3 characters"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
  adminFullNameEn: z.string().min(1, "Required"),
  adminFullNameAr: z.string().optional(),
  adminPhone: saudiPhoneSchema.optional(),
  branchName: z.string().min(1).optional(),
});

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

export const updateOrganizationSettingsSchema = z.object({
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  dateFormat: z.string().min(1).optional(),
  timeFormat24h: z.boolean().optional(),
  reportHeaderText: z.string().optional().nullable(),
  reportFooterText: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  themeColor: z.string().optional().nullable(),
  rewardPointsEnabled: z.boolean().optional(),
  rewardPointsName: z.string().min(1).optional(),
  pointValueSar: z.number().min(0).optional(),
  pointsEarnDivisor: z.number().positive().optional(),
  minOrderForPoints: z.number().min(0).optional(),
  maxPointsPerOrder: z.number().int().positive().optional().nullable(),
  minRedeemPoints: z.number().int().min(0).optional(),
  maxRedeemPoints: z.number().int().positive().optional().nullable(),
  pointsExpiryDays: z.number().int().positive().optional().nullable(),
  paymentReminderEnabled: z.boolean().optional(),
  paymentReminderAfterDays: z.number().int().positive().optional(),
  paymentReminderIntervalDays: z.number().int().positive().optional(),
  customerApprovalRequired: z.boolean().optional(),
  contactCustomField1Label: z.string().optional().nullable(),
  contactCustomField2Label: z.string().optional().nullable(),
  contactCustomField3Label: z.string().optional().nullable(),
  contactCustomField4Label: z.string().optional().nullable(),
  contactCustomField5Label: z.string().optional().nullable(),
  contactCustomField6Label: z.string().optional().nullable(),
  contactCustomField7Label: z.string().optional().nullable(),
  contactCustomField8Label: z.string().optional().nullable(),
  contactCustomField9Label: z.string().optional().nullable(),
  contactCustomField10Label: z.string().optional().nullable(),
  sellCustomField1Label: z.string().optional().nullable(),
  sellCustomField2Label: z.string().optional().nullable(),
  sellCustomField3Label: z.string().optional().nullable(),
  sellCustomField4Label: z.string().optional().nullable(),
});
