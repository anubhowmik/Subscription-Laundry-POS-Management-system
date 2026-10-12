import { Router } from "express";
import * as controller from "./promotion.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { massDeactivateSchema, promotionSchema } from "./promotion.validators";

// Reference PromotionsController - promotions.view/create/update/delete. The POS side (the
// active-promotion dropdown and "Apply") lives under /pos, gated by POS access instead.
const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

router.get("/", requirePermission("promotions.view"), controller.list);
router.get("/options", requirePermission("promotions.create", "promotions.update"), controller.options);
router.get("/:id", requirePermission("promotions.view"), controller.getById);
router.post("/", requirePermission("promotions.create"), validate(promotionSchema), controller.create);
router.post("/mass-deactivate", requirePermission("promotions.update"), validate(massDeactivateSchema), controller.massDeactivate);
router.put("/:id", requirePermission("promotions.update"), validate(promotionSchema), controller.update);
router.post("/:id/activate", requirePermission("promotions.update"), controller.activate);
router.delete("/:id", requirePermission("promotions.delete"), controller.remove);

export default router;
