import { z } from "zod";

export const createSupplierSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().optional(),
  phone: z.string().min(1, "Phone is required"),
  altPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  businessLocationId: z.string().uuid().optional().nullable(),
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

export const updateSupplierSchema = createSupplierSchema.partial();

export const listSupplierQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
