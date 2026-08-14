import { z } from "zod";
import { saudiPhoneSchema } from "../../utils/validators";

export const createCustomerSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().optional(),
  phone: saudiPhoneSchema,
  altPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  customerGroupId: z.string().uuid().optional().nullable(),
  businessLocationId: z.string().uuid().optional().nullable(),
  priceListId: z.string().uuid().optional().nullable(),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  postalCode: z.string().optional(),
  vatNumber: z.string().optional(),
  crNumber: z.string().optional(),
  nationalAddress: z.string().optional(),
  notes: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  openingBalance: z.number().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const setApprovalStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export const applyCreditToSaleSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
});

export const listCustomerQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  customerGroupId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
