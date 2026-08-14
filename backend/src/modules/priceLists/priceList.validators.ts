import { z } from "zod";

export const createPriceListSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
});

export const updatePriceListSchema = z.object({
  nameEn: z.string().min(1).optional(),
  nameAr: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const priceListItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    price: z.number().min(0),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each price list item must reference exactly one of productId or serviceId",
  });

export const setPriceListItemsSchema = z.object({
  items: z.array(priceListItemSchema),
});
