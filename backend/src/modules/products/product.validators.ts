import { z } from "zod";

export const createProductSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcodeType: z.string().optional(),
  barcode: z.string().optional(),
  brandId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  image: z.string().optional(),
  manageStock: z.boolean().optional(),
  alertQuantity: z.number().min(0).optional(),
  taxId: z.string().uuid().optional().nullable(),
  sellingPriceTaxType: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
  purchasePrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0),
  businessLocationIds: z.array(z.string().uuid()).min(1, "Assign at least one business location"),
  initialStock: z.number().min(0).optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ businessLocationIds: true, initialStock: true }).extend({
  businessLocationIds: z.array(z.string().uuid()).optional(),
});

export const listProductQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
  taxId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  customerId: z.string().uuid().optional(),
});
