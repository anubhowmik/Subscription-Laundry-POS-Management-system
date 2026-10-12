import { z } from "zod";

const optionalUuid = z.string().uuid().nullable().optional();
const dateString = z.string().min(1, "Required");

export const accountTypeSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  parentAccountTypeId: optionalUuid,
});

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Required"),
  accountNumber: z.string().trim().min(1, "Required"),
  kind: z.enum(["BANK", "CASH", "CHEQUE"]).optional(),
  accountTypeId: optionalUuid,
  openingBalance: z.number().optional(),
  accountDetails: z.array(z.object({ label: z.string().optional(), value: z.string().optional() })).max(6).optional(),
  note: z.string().nullable().optional(),
  isMajor: z.boolean().optional(),
});

export const depositSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
  fromAccountId: optionalUuid,
  operationDate: dateString,
  note: z.string().optional(),
});

export const fundTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
  referenceNo: z.string().optional(),
  operationDate: dateString,
  note: z.string().optional(),
});

export const updateTransactionSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive("Amount must be greater than zero"),
  operationDate: dateString,
  note: z.string().nullable().optional(),
  counterAccountId: optionalUuid,
});

export const linkAccountSchema = z.object({
  paymentAccountId: z.string().uuid(),
  // Which record the Payment Account Report row came from - a sale payment, a purchase or an expense.
  source: z.enum(["SALE", "PURCHASE", "EXPENSE"]).default("SALE"),
});

export const locationDefaultsSchema = z.object({
  items: z.array(z.object({ paymentMethodId: z.string().uuid(), paymentAccountId: z.string().uuid().nullable() })),
});
