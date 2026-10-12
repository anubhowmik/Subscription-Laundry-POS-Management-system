import { Router } from "express";
import * as controller from "./discount.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { discountSchema, massDeactivateDiscountsSchema } from "./discount.validators";

// Reference DiscountController - every action gated by the single `discount.access` permission.
// The POS lookup (which discount an added item gets) lives under /pos.
const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));
router.use(requirePermission("discount.access"));

router.get("/", controller.list);
router.get("/options", controller.options);
router.get("/:id", controller.getById);
router.post("/", validate(discountSchema), controller.create);
router.post("/mass-deactivate", validate(massDeactivateDiscountsSchema), controller.massDeactivate);
router.put("/:id", validate(discountSchema), controller.update);
router.post("/:id/activate", controller.activate);
router.delete("/:id", controller.remove);

export default router;
