import { z } from "zod";

export const createInvoiceLayoutSchema = z.object({
  businessLocationId: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required"),
  templateKey: z.enum(["standard", "thermal58", "thermal80", "a4Full", "a5", "garmentTag"]).optional(),
  logoUrl: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  showLogo: z.boolean().optional(),
  showBranchName: z.boolean().optional(),
  showCity: z.boolean().optional(),
  showQrCode: z.boolean().optional(),
  showVatNumber: z.boolean().optional(),
  showCrNumber: z.boolean().optional(),
  showInvoiceUuid: z.boolean().optional(),
  showIcv: z.boolean().optional(),
  showCustomerVat: z.boolean().optional(),
  showCustomerPhone: z.boolean().optional(),
  showItemSku: z.boolean().optional(),
  showDiscountLine: z.boolean().optional(),
  showPaidDue: z.boolean().optional(),
  showEstimatedReady: z.boolean().optional(),
  showRegisterSession: z.boolean().optional(),
  showDigitalSignatureNote: z.boolean().optional(),
  labelOverrides: z.record(z.string(), z.object({ en: z.string(), ar: z.string() })).optional().nullable(),
});

export const updateInvoiceLayoutSchema = createInvoiceLayoutSchema.partial().omit({ businessLocationId: true });

export const listInvoiceLayoutQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
});
