import { z } from "zod";

export const createBusinessLocationSchema = z.object({
  businessNameEn: z.string().min(1),
  businessNameAr: z.string().min(1),
  branchName: z.string().min(1),
  branchNameAr: z.string().optional(),
  branchCode: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  buildingNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  vatNumber: z.string().optional(),
  crNumber: z.string().optional(),
  nationalAddress: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  groupId: z.string().uuid().optional().nullable(),
  defaultPriceListId: z.string().uuid().optional().nullable(),
  receiptPrinterType: z.enum(["browser", "printer"]).optional(),
  printReceiptOnInvoice: z.boolean().optional(),
  printerName: z.string().optional().nullable(),
  paperWidthMm: z.number().int().positive().optional().nullable(),
  invoiceNumberPrefix: z.string().min(1).optional(),
  quoteNumberPrefix: z.string().min(1).optional(),
  draftNumberPrefix: z.string().min(1).optional(),
  returnNumberPrefix: z.string().min(1).optional(),
  reissueNumberPrefix: z.string().min(1).optional(),
  numberResetYearly: z.boolean().optional(),
});

export const updateBusinessLocationSchema = createBusinessLocationSchema.partial();

export const invoiceLayoutSettingsSchema = z.object({
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

export type InvoiceLayoutSettingsInput = z.infer<typeof invoiceLayoutSettingsSchema>;

export const listBusinessLocationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
