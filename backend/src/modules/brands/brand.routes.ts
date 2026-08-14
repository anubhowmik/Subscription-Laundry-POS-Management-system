import { Router } from "express";
import * as controller from "./brand.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createBrandSchema, listBrandQuerySchema, updateBrandSchema } from "./brand.validators";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("brands.view"), validate(listBrandQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("brands.view"), controller.getById);
router.post("/", requirePermission("brands.create"), validate(createBrandSchema), controller.create);
router.put("/:id", requirePermission("brands.update"), validate(updateBrandSchema), controller.update);
router.delete("/:id", requirePermission("brands.delete"), controller.deactivate);

export default router;
