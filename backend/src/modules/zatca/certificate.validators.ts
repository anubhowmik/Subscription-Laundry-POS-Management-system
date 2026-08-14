import { z } from "zod";

export const complianceCsidSchema = z.object({
  otp: z.string().min(1, "OTP is required"),
});
