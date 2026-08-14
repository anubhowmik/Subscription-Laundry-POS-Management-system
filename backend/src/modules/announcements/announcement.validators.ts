import { z } from "zod";

export const createAnnouncementSchema = z
  .object({
    businessLocationIds: z.array(z.string().uuid()).optional(), // empty/omitted = all locations
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
    content: z.string().min(1, "Content is required"),
    isPublished: z.boolean().optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: "To date must be on or after the from date", path: ["toDate"] });

export const updateAnnouncementSchema = z.object({
  businessLocationIds: z.array(z.string().uuid()).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  content: z.string().min(1).optional(),
  isPublished: z.boolean().optional(),
});

export const listAnnouncementQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});
