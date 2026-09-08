import { Router } from "express";
import { z } from "zod";
import * as authController from "./platformAuth.controller";
import * as controller from "./platform.controller";
import { validate } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { authenticatePlatformAdmin } from "../../middleware/authenticatePlatformAdmin";

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});

// Only these two transitions are exposed. TRIAL and CANCELLED are lifecycle states the billing
// flow owns, not something an operator should be able to set by hand.
const setStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

const createAdminSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(8),
});

const setAdminStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const resetAdminPasswordSchema = z.object({
  // Required only when resetting your OWN password (enforced in the service, which knows the
  // target vs. acting admin) - an admin resetting someone ELSE's password doesn't have it.
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8),
});

const router = Router();

// Auth endpoints are public (you cannot be logged in before logging in).
router.post("/auth/login", authLimiter, validate(loginSchema), authController.login);
router.post("/auth/refresh", authController.refresh);
router.post("/auth/logout", authController.logout);
router.get("/auth/me", authenticatePlatformAdmin, authController.me);

// Everything below requires a valid PLATFORM token. A tenant user's token fails here.
router.use(authenticatePlatformAdmin);

router.get("/stats", controller.getStats);
router.get("/organizations", controller.listOrganizations);
router.get("/organizations/:id/users", controller.listOrganizationUsers);
router.patch("/organizations/:id/status", validate(setStatusSchema), controller.setOrganizationStatus);
router.get("/payments", controller.listPayments);

router.get("/admins", controller.listAdmins);
router.post("/admins", validate(createAdminSchema), controller.createAdmin);
router.patch("/admins/:id/status", validate(setAdminStatusSchema), controller.setAdminStatus);
router.post("/admins/:id/reset-password", validate(resetAdminPasswordSchema), controller.resetAdminPassword);

export default router;
