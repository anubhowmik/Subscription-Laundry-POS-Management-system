import { z } from "zod";

export const createAccountSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().optional(),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  parentAccountId: z.string().uuid().optional().nullable(),
  openingBalance: z.number().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();
