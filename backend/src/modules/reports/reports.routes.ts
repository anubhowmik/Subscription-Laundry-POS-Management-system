import { Router } from "express";
import * as controller from "./reports.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import {
  salesReportQuerySchema,
  inventoryReportQuerySchema,
  accountingReportQuerySchema,
  salesByServiceReportQuerySchema,
  agingReportQuerySchema,
  staffProductivityReportQuerySchema,
  vatBreakdownReportQuerySchema,
} from "./reports.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry"));

router.get("/sales", requirePermission("reports.sales"), validate(salesReportQuerySchema, "query"), controller.salesReport);
router.get("/inventory", requirePermission("reports.inventory"), validate(inventoryReportQuerySchema, "query"), controller.inventoryReport);
router.get("/accounting", requirePermission("reports.accounting"), validate(accountingReportQuerySchema, "query"), controller.accountingReport);
router.get(
  "/sales-by-service",
  requirePermission("reports.sales"),
  validate(salesByServiceReportQuerySchema, "query"),
  controller.salesByServiceReport,
);
router.get("/ar-aging", requirePermission("reports.accounting"), validate(agingReportQuerySchema, "query"), controller.arAgingReport);
router.get("/ap-aging", requirePermission("reports.accounting"), validate(agingReportQuerySchema, "query"), controller.apAgingReport);
router.get(
  "/staff-productivity",
  requirePermission("reports.sales"),
  validate(staffProductivityReportQuerySchema, "query"),
  controller.staffProductivityReport,
);
router.get(
  "/vat-breakdown",
  requirePermission("reports.accounting"),
  validate(vatBreakdownReportQuerySchema, "query"),
  controller.vatBreakdownReport,
);

export default router;
