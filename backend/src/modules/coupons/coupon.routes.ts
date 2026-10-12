import { Router } from "express";
import * as controller from "./coupon.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { uploadSpreadsheet } from "../../middleware/upload";
import { bulkCouponSchema, createCouponSchema, massCouponSchema, updateCouponSchema } from "./coupon.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

// Reference CouponController permissions; the older all-in-one "coupons.manage" still works.
const can = (action: "view" | "create" | "update" | "delete") => requirePermission(`coupons.${action}`, "coupons.manage");

router.get("/", can("view"), controller.list);
router.get("/options", can("view"), controller.options);
router.post("/", can("create"), validate(createCouponSchema), controller.create);
router.post("/bulk", can("create"), validate(bulkCouponSchema), controller.createBulk);
router.post("/import", can("create"), uploadSpreadsheet.single("file"), controller.importCoupons);
router.post("/mass-deactivate", can("update"), validate(massCouponSchema), controller.massDeactivate);
router.get("/:id", can("view"), controller.getById);
router.put("/:id", can("update"), validate(updateCouponSchema), controller.update);
router.post("/:id/activate", can("update"), controller.activate);
router.delete("/:id", can("delete"), controller.remove);

export default router;
