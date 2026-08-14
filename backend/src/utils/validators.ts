import { z } from "zod";

// Accepts local (05XXXXXXXX) and international (+9665XXXXXXXX / 9665XXXXXXXX) Saudi mobile formats.
export const saudiPhoneSchema = z
  .string()
  .regex(/^(?:\+?966|0)5\d{8}$/, "Enter a valid Saudi phone number, e.g. 05XXXXXXXX or +9665XXXXXXXX");
