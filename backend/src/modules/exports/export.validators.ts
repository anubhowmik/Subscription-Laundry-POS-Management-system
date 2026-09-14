import { z } from "zod";

export const exportXlsxSchema = z.object({
  filename: z.string().trim().min(1).max(100),
  columns: z.array(z.object({ key: z.string().min(1), label: z.string().min(1) })).min(1),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
});
