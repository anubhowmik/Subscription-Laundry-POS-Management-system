import { Router } from "express";
import * as controller from "./category.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createCategorySchema, listCategoryQuerySchema, updateCategorySchema } from "./category.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_product"));

router.get("/", requirePermission("categories.view"), validate(listCategoryQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("categories.view"), controller.getById);
router.post("/", requirePermission("categories.create"), validate(createCategorySchema), controller.create);
router.put("/:id", requirePermission("categories.update"), validate(updateCategorySchema), controller.update);
router.delete("/:id", requirePermission("categories.delete"), controller.deactivate);

export default router;
