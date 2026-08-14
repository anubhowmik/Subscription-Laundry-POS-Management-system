import { z } from "zod";

export const adjustCashbackSchema = z.object({
  amount: z.number().refine((v) => v !== 0, "Amount cannot be zero"),
  note: z.string().min(1, "Note is required"),
});
