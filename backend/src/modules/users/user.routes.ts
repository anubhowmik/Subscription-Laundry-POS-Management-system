import { Router } from "express";
import * as controller from "./user.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createUserSchema, listUserQuerySchema, resetPasswordSchema, updateUserSchema } from "./user.validators";

const router = Router();
router.use(authenticate);

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

export default router;
