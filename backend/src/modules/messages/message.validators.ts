import { z } from "zod";

export const createMessageSchema = z.object({
  fromBusinessLocationId: z.string().uuid(),
  toBusinessLocationId: z.string().uuid(),
  subject: z.string().min(1, "Subject is required"),
  content: z.string().min(1, "Content is required"),
  parentMessageId: z.string().uuid().optional(),
});

export const listMessageQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
});
