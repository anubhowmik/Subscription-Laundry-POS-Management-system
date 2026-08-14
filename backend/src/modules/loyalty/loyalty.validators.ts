import { z } from "zod";

export const adjustPointsSchema = z.object({
  points: z.number().int().refine((v) => v !== 0, "Points cannot be zero"),
  note: z.string().min(1, "Note is required"),
});
