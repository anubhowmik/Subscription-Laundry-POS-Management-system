import { Router } from "express";
import * as controller from "./businessLocationGroup.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  createBusinessLocationGroupSchema,
  listBusinessLocationGroupQuerySchema,
  updateBusinessLocationGroupSchema,
} from "./businessLocationGroup.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("business_locations.update"));

router.get("/", validate(listBusinessLocationGroupQuerySchema, "query"), controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(createBusinessLocationGroupSchema), controller.create);
router.put("/:id", validate(updateBusinessLocationGroupSchema), controller.update);
router.delete("/:id", controller.remove);

export default router;
