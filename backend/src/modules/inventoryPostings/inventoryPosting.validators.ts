import { z } from "zod";

// Full-replace shape for both create() and update() - matches the reference's own edit screen,
// which is the same create() form just pre-filled (InventoryPostingController@edit/@update), not
// a partial patch.
export const inventoryPostingSchema = z.object({
  businessLocationId: z.string().uuid(),
  cashInDrawer: z.number().min(0).optional(),
  notes: z.string().optional(),
  employeeIds: z.array(z.string().uuid()).min(1, "At least one employee is required"),
  searchDateFrom: z.string().min(1, "Required"),
  searchDateTo: z.string().min(1, "Required"),
  inStockSaleIds: z.array(z.string().uuid()).default([]),
  outStockSaleIds: z.array(z.string().uuid()).default([]),
  inWarehouseSaleIds: z.array(z.string().uuid()).default([]),
});

export const listInventoryPostingQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "CONFIRMED"]).optional(),
});

// InventoryPostingController@create's AJAX search - every FINAL sale at this location, in this
// date range, whose derived shipping status is READY (see sale.service.ts's
// computeShippingStatus()) and not already classified on another posting.
export const listClassifiedSalesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const searchReadySalesQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
  from: z.string().min(1, "Required"),
  to: z.string().min(1, "Required"),
  categoryId: z.string().uuid().optional(),
  serviceCategoryId: z.string().uuid().optional(),
});
