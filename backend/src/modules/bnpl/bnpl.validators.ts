import { z } from "zod";

export const createBnplSessionSchema = z.object({
  businessLocationId: z.string().uuid(),
  provider: z.enum(["TAMARA", "TABBY", "MISPAY"]),
  amount: z.number().positive("Amount must be greater than zero"),
  customerId: z.string().uuid(),
  customerPhone: z.string().min(5, "A phone number is required for BNPL"),
});

export const updateBnplProviderSettingsSchema = z.object({
  isEnabled: z.boolean(),
  merchantToken: z.string().min(1).optional(),
  apiBaseUrlOverride: z.string().url().optional(),
});

export type CreateBnplSessionInput = z.infer<typeof createBnplSessionSchema>;
