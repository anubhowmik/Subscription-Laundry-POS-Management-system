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
