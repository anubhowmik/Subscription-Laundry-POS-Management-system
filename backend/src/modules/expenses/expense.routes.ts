import { Router } from "express";
import * as controller from "./expense.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  createExpenseSchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  listExpenseQuerySchema,
} from "./expense.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/categories", requirePermission("expenses.view"), controller.listCategories);
router.post("/categories", requirePermission("expense_categories.manage"), validate(createExpenseCategorySchema), controller.createCategory);
router.put("/categories/:id", requirePermission("expense_categories.manage"), validate(updateExpenseCategorySchema), controller.updateCategory);

router.get("/", requirePermission("expenses.view"), validate(listExpenseQuerySchema, "query"), controller.list);
router.get("/:id", requirePermission("expenses.view"), controller.getById);
router.post("/", requirePermission("expenses.create"), validate(createExpenseSchema), controller.create);
router.put("/:id", requirePermission("expenses.update"), validate(updateExpenseSchema), controller.update);
router.delete("/:id", requirePermission("expenses.delete"), controller.remove);

export default router;
