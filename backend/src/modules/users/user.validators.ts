import { z } from "zod";

export const createUserSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters").optional(),
    email: z.string().email().optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    fullNameEn: z.string().min(1),
    fullNameAr: z.string().optional(),
    phone: z.string().optional(),
    roleId: z.string().uuid(),
    businessLocationIds: z.array(z.string().uuid()).default([]),
    isSystemAdmin: z.boolean().optional(),
    // (a) Non-login staff (P8-5) - a record that exists only to be referenced (e.g. createdBy),
    // never actually signs in. Off means username/email/password aren't required at all.
    allowLogin: z.boolean().default(true),
    // (b) Per-cashier invoice-discount ceiling (P8-5) - null/omitted = unlimited.
    maxDiscountPercent: z.number().min(0).max(100).optional().nullable(),
    // (c) Per-user customer/customer-group access restriction - omitted = unrestricted.
    customerIds: z.array(z.string().uuid()).optional(),
    customerGroupIds: z.array(z.string().uuid()).optional(),
    // (d) Per-user stock-transfer-from-location restriction - omitted = unrestricted.
    transferFromLocationIds: z.array(z.string().uuid()).optional(),
  })
  .refine((v) => !v.allowLogin || Boolean(v.username && v.email && v.password), {
    message: "Username, email, and password are required when login is allowed",
    path: ["password"],
  });

export const updateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  email: z.string().email().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  fullNameEn: z.string().min(1).optional(),
  fullNameAr: z.string().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
  businessLocationIds: z.array(z.string().uuid()).optional(),
  isSystemAdmin: z.boolean().optional(),
  allowLogin: z.boolean().optional(),
  maxDiscountPercent: z.number().min(0).max(100).optional().nullable(),
  customerIds: z.array(z.string().uuid()).optional(),
  customerGroupIds: z.array(z.string().uuid()).optional(),
  transferFromLocationIds: z.array(z.string().uuid()).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const listUserQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  roleId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
