import { z } from "zod";

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
