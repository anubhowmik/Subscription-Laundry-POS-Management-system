import { Router } from "express";
import * as controller from "./service.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createServiceSchema, listServiceQuerySchema, updateServiceSchema } from "./service.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service"));

router.get("/", requirePermission("services.view"), validate(listServiceQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("services.view"), controller.getById);
router.post("/", requirePermission("services.create"), validate(createServiceSchema), controller.create);
router.put("/:id", requirePermission("services.update"), validate(updateServiceSchema), controller.update);
router.delete("/:id", requirePermission("services.delete"), controller.deactivate);

export default router;
