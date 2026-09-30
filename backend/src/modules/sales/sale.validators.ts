import { z } from "zod";

export const updateItemStatusSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]),
  note: z.string().optional(),
});

export const listBoardItemsQuerySchema = z.object({
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]).optional(),
  search: z.string().optional(),
  // Reference's own Orders board filters (Restaurant\OrderController@index, laundry branch) -
  // service/category narrow which garments show up, from/to narrows by the invoice's sale date.
  // Naming matches sale.service.ts's own list()'s serviceId/serviceCategoryId convention.
  serviceId: z.string().uuid().optional(),
  serviceCategoryId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  returned: z.enum(["true", "false"]).optional(),
});

export const bulkUpdateItemStatusSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, "Select at least one item"),
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]),
  note: z.string().optional(),
});

export const payDueSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const listShipmentsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  paymentStatus: z.enum(["PAID", "PARTIAL", "DUE", "OVERPAID"]).optional(),
  // Reference's own `shipping_status` filter (SellController@shipments) - this app has no
  // separate whole-sale shipping-status column, it reuses the same per-item fulfillment states
  // already tracked on SaleItem (see sale.service.ts's computeShippingStatus).
  shippingStatus: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
});
