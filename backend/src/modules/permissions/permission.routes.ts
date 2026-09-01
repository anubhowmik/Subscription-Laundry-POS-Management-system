import { Router } from "express";
import * as controller from "./permission.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";

const router = Router();
router.use(authenticate, requirePermission("roles.view", "roles.create", "roles.update"));
router.use(requirePermission("app.users_rules"));

router.get("/", controller.list);

export default router;
