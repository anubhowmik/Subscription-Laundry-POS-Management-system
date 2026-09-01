import { Router } from "express";
import * as controller from "./user.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createUserSchema, listUserQuerySchema, resetPasswordSchema, setAppAccessSchema, updateUserSchema } from "./user.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.users_rules"));

router.get("/", requirePermission("users.view"), validate(listUserQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("users.view"), controller.getById);
router.post("/", requirePermission("users.create"), validate(createUserSchema), controller.create);
router.put("/:id", requirePermission("users.update"), validate(updateUserSchema), controller.update);
router.post("/:id/activate", requirePermission("users.update"), controller.activate);
router.post("/:id/deactivate", requirePermission("users.update"), controller.deactivate);
router.post(
  "/:id/reset-password",
  requirePermission("users.reset_password"),
  validate(resetPasswordSchema),
  controller.resetPassword,
);
// Route-level gate is users.update (consistent with the rest of this file); setAppAccess()
// itself additionally requires isSystemAdmin - see its comment in user.service.ts for why.
router.put("/:id/app-access", requirePermission("users.update"), validate(setAppAccessSchema), controller.setAppAccess);

export default router;
