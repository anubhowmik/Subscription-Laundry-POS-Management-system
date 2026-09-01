import { Router } from "express";
import * as controller from "./serviceCategory.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createServiceCategorySchema } from "./serviceCategory.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/", requirePermission("services.view"), controller.list);
router.post("/", requirePermission("services.create"), validate(createServiceCategorySchema), controller.create);

export default router;
