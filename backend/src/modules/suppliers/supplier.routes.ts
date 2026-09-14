import { Router } from "express";
import * as controller from "./supplier.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { uploadSpreadsheet } from "../../middleware/upload";
import { createSupplierSchema, listSupplierQuerySchema, updateSupplierSchema } from "./supplier.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_product"));
router.use(requirePermission("suppliers.manage"));

router.post("/import", uploadSpreadsheet.single("file"), controller.importSuppliers);
router.get("/", validate(listSupplierQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.get("/:id/profile", controller.getProfile);
router.post("/", validate(createSupplierSchema), controller.create);
router.put("/:id", validate(updateSupplierSchema), controller.update);
router.delete("/:id", controller.deactivate);
router.put("/:id/activate", controller.activate);

export default router;
