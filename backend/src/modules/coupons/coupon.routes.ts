import { Router } from "express";
import * as controller from "./coupon.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createCouponSchema, updateCouponSchema, validateCouponQuerySchema } from "./coupon.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

// Any POS user can preview a code at checkout; only managers can create/edit/list the catalog.
router.get("/preview", requirePermission("pos.access"), validate(validateCouponQuerySchema, "query"), controller.preview);

router.use(requirePermission("coupons.manage"));
router.get("/", controller.list);
router.post("/", validate(createCouponSchema), controller.create);
router.put("/:id", validate(updateCouponSchema), controller.update);
router.delete("/:id", controller.deactivate);

export default router;
