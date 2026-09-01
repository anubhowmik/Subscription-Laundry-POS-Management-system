import { Router } from "express";
import * as controller from "./product.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createProductSchema, listProductQuerySchema, updateProductSchema } from "./product.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/", requirePermission("products.view"), validate(listProductQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("products.view"), controller.getById);
router.post("/", requirePermission("products.create"), validate(createProductSchema), controller.create);
router.put("/:id", requirePermission("products.update"), validate(updateProductSchema), controller.update);
router.delete("/:id", requirePermission("products.delete"), controller.deactivate);

export default router;
