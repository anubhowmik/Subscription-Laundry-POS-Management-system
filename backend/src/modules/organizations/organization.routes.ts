import { Router } from "express";
import * as controller from "./organization.controller";
import { validate } from "../../middleware/validate";
import { authLimiter } from "../../middleware/rateLimiter";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { registerOrganizationSchema, updateOrganizationSettingsSchema } from "./organization.validators";

const router = Router();

// Public - this is how a new tenant is created, no auth required.
router.post("/register", authLimiter, validate(registerOrganizationSchema), controller.register);

// This router is mounted outside the global auth/paywall block (registration must stay reachable
// without a session) so these two routes gate themselves explicitly.
router.get("/settings", authenticate, requirePermission("settings.manage"), controller.getSettings);
router.put("/settings", authenticate, requirePermission("settings.manage"), validate(updateOrganizationSettingsSchema), controller.updateSettings);

export default router;
