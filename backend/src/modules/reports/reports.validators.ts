import { z } from "zod";

export const salesReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  saleType: z.enum(["PRODUCT", "SERVICE", "MIXED"]).optional(),
});

export const inventoryReportQuerySchema = z.object({
  businessLocationId: z.string().uuid().optional(),
  lowStockOnly: z.enum(["true", "false"]).optional(),
});

export const accountingReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});

export const salesByServiceReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});

export const agingReportQuerySchema = z.object({
  businessLocationId: z.string().uuid().optional(),
});

export const staffProductivityReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});

export const vatBreakdownReportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const dailyProductsReportQuerySchema = z.object({
  // Which app the report was opened from (Service POS / Product POS scope it; POS Laundry omits it).
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  // Comma-separated branch ids (the reference's multi-select `location_id[]`).
  locationIds: z.string().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  sheet: z.enum(["all", "products", "categories"]).optional(),
  lang: z.enum(["en", "ar"]).optional(),
});

// Shared by every page under the Reports dropdown (reference's report.js filter frame).
const reportFrameQuery = {
  // Which app the report was opened from (Service POS / Product POS scope it; POS Laundry omits it).
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  locationIds: z.string().optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  lang: z.enum(["en", "ar"]).optional(),
};

export const companiesReportQuerySchema = z.object({ ...reportFrameQuery, customerGroupId: z.string().uuid().optional() });
export const detailedCompaniesReportQuerySchema = companiesReportQuerySchema;

const itemKey = /^(p|s):[0-9a-f-]{36}$/i;
export const productsReportQuerySchema = z.object({
  ...reportFrameQuery,
  customerGroupId: z.string().uuid().optional(),
  categoryId: z.string().regex(/^(pc|sc):[0-9a-f-]{36}$/i, "Invalid category").optional(),
  // Comma-separated "p:<productId>" / "s:<serviceId>" keys (the reference's multi-select `product_id[]`).
  itemIds: z
    .string()
    .optional()
    .refine((v) => !v || v.split(",").every((k) => itemKey.test(k)), "Invalid product"),
});

const shippingStatus = /^(PENDING|IN_PROGRESS|READY|DELIVERED|CANCELLED)$/;
export const salesReportV2QuerySchema = z.object({
  ...reportFrameQuery,
  // Comma-separated derived shipping statuses (the reference's multi-select `shipping_status[]`).
  shippingStatuses: z
    .string()
    .optional()
    .refine((v) => !v || v.split(",").every((k) => shippingStatus.test(k)), "Invalid shipping status"),
});

export const detailedSalesReportQuerySchema = z.object(reportFrameQuery);
export const branchSalesReportQuerySchema = z.object(reportFrameQuery);
export const taxReportQuerySchema = z.object(reportFrameQuery);
export const registerReportQuerySchema = z.object({ ...reportFrameQuery, userId: z.string().uuid().optional(), status: z.enum(["open", "close"]).optional() });
export const compensationsReportQuerySchema = z.object({
  ...reportFrameQuery,
  customerGroupId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAID"]).optional(),
});
export const reportCustomerSearchQuerySchema = z.object({ search: z.string().max(100).optional() });
export const cashbackReportQuerySchema = z.object({ ...reportFrameQuery, customerGroupId: z.string().uuid().optional(), customerId: z.string().uuid().optional() });
export const loyaltyPointsReportQuerySchema = cashbackReportQuerySchema;
export const cashRegisterReportQuerySchema = z.object({ ...reportFrameQuery, status: z.enum(["open", "close"]).optional() });
export const customerVisitsReportQuerySchema = cashbackReportQuerySchema;

// CRM Reports dropdown.
export const customersRevenueReportQuerySchema = z.object({
  ...reportFrameQuery,
  customerGroupId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  promotionId: z.string().uuid().optional(),
});
export const newCustomersReportQuerySchema = customersRevenueReportQuerySchema;
export const campaignPerformanceReportQuerySchema = z.object({ ...reportFrameQuery, promotionId: z.string().uuid().optional() });
export const consumerBehaviourReportQuerySchema = z.object({
  ...reportFrameQuery,
  // Reference's required Customer Group select: "all" (All Customers), "ungrouped" (Locations Customers) or a group id.
  customerGroup: z.union([z.literal("all"), z.literal("ungrouped"), z.string().uuid()]).optional(),
  customerId: z.string().uuid().optional(),
});
export const discountCouponReportQuerySchema = z.object({ ...reportFrameQuery, couponId: z.string().uuid().optional() });
export const declineCustomersReportQuerySchema = z.object({
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  locationIds: z.string().optional(),
  customerGroupId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  datePoint: dateOnly.optional(),
  lang: z.enum(["en", "ar"]).optional(),
});
export const customersRetentionReportQuerySchema = z.object({
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  locationIds: z.string().optional(),
  customerGroupId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  // Reference `date_point` (single date, default today).
  datePoint: dateOnly.optional(),
  lang: z.enum(["en", "ar"]).optional(),
});

// Sales Reports dropdown.
export const dailySalesReportQuerySchema = z.object({
  // Which app the report was opened from (Service POS / Product POS scope it; POS Laundry omits it).
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  locationIds: z.string().optional(),
  date: dateOnly.optional(),
  lang: z.enum(["en", "ar"]).optional(),
});
export const lflSalesReportQuerySchema = z.object(reportFrameQuery);
export const salesAnalysisReportQuerySchema = z.object({
  // Which app the report was opened from (Service POS / Product POS scope it; POS Laundry omits it).
  app: z.enum(["service", "product"]).optional(),
  locationGroupId: z.string().uuid().optional(),
  locationIds: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  compareYear: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  lang: z.enum(["en", "ar"]).optional(),
});
export const salesPerformanceReportQuerySchema = salesAnalysisReportQuerySchema;
