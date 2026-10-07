import { Router } from "express";
import * as controller from "./serviceCategory.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createServiceCategorySchema, listServiceCategoryQuerySchema, updateServiceCategorySchema } from "./serviceCategory.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service"));

router.get("/", requirePermission("services.view"), validate(listServiceCategoryQuerySchema, "query"), controller.list);
router.post("/", requirePermission("services.create"), validate(createServiceCategorySchema), controller.create);
router.put("/:id", requirePermission("services.update"), validate(updateServiceCategorySchema), controller.update);

export default router;
