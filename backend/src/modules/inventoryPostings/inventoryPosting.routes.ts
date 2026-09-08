import { Router } from "express";
import * as controller from "./inventoryPosting.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createInventoryPostingSchema, listInventoryPostingQuerySchema } from "./inventoryPosting.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_product"));
router.use(requirePermission("inventory_postings.manage"));

router.get("/preview", controller.preview);
router.get("/", validate(listInventoryPostingQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(createInventoryPostingSchema), controller.create);
router.put("/:id/confirm", controller.confirm);

export default router;
