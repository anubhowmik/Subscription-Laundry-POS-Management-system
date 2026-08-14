import { z } from "zod";

export const openRegisterSchema = z.object({
  businessLocationId: z.string().uuid(),
  openingCashAmount: z.number().min(0).default(0),
});

export const closeRegisterSchema = z.object({
  countedCashAmount: z.number().min(0),
  notes: z.string().optional(),
  denominations: z.record(z.string(), z.number().min(0)).optional(),
});

export const currentRegisterQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
});

export const listRegisterQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
  page: z.string().optional(),
  limit: z.string().optional(),
});
