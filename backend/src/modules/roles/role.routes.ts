import { Router } from "express";
import * as controller from "./role.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createRoleSchema, updateRoleSchema } from "./role.validators";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("roles.view", "users.view"), controller.list);
router.get("/:id", requirePermission("roles.view"), controller.getById);
router.post("/", requirePermission("roles.create"), validate(createRoleSchema), controller.create);
router.put("/:id", requirePermission("roles.update"), validate(updateRoleSchema), controller.update);
router.delete("/:id", requirePermission("roles.delete"), controller.remove);

export default router;
