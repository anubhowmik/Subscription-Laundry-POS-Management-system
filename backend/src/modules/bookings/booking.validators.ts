import { z } from "zod";

export const createBookingSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
  type: z.enum(["PICKUP", "DELIVERY"]),
  scheduledAt: z.string().datetime().or(z.string().min(1)),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]),
});

export const listBookingsQuerySchema = z.object({
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  type: z.enum(["PICKUP", "DELIVERY"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
