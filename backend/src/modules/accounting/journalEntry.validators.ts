import { z } from "zod";

export const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  memo: z.string().optional(),
});

export const createJournalEntrySchema = z.object({
  entryDate: z.string().min(1, "Date is required"),
  reference: z.string().optional(),
  memo: z.string().optional(),
  lines: z.array(journalLineSchema).min(2, "A journal entry needs at least two lines"),
});

export const updateJournalEntrySchema = createJournalEntrySchema.partial();
