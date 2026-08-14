import { Router } from "express";
import * as controller from "./priceList.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { createPriceListSchema, updatePriceListSchema, setPriceListItemsSchema } from "./priceList.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("price-lists.manage"));

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", validate(createPriceListSchema), controller.create);
router.put("/:id", validate(updatePriceListSchema), controller.update);
router.delete("/:id", controller.deactivate);
router.put("/:id/items", validate(setPriceListItemsSchema), controller.setItems);

export default router;
