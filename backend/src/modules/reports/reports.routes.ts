import { Router } from "express";
import * as controller from "./reports.controller";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/permission";
import { validate } from "../../middleware/validate";
import { REPORT_PERMISSIONS } from "./reportCommon";
import {
  salesReportQuerySchema,
  inventoryReportQuerySchema,
  accountingReportQuerySchema,
  salesByServiceReportQuerySchema,
  agingReportQuerySchema,
  staffProductivityReportQuerySchema,
  vatBreakdownReportQuerySchema,
  dailyProductsReportQuerySchema,
  companiesReportQuerySchema,
  detailedCompaniesReportQuerySchema,
  productsReportQuerySchema,
  salesReportV2QuerySchema,
  detailedSalesReportQuerySchema,
  branchSalesReportQuerySchema,
  taxReportQuerySchema,
  registerReportQuerySchema,
  compensationsReportQuerySchema,
  reportCustomerSearchQuerySchema,
  cashbackReportQuerySchema,
  loyaltyPointsReportQuerySchema,
  cashRegisterReportQuerySchema,
  customerVisitsReportQuerySchema,
} from "./reports.validators";

const router = Router();
router.use(authenticate);
router.use(requirePermission("app.pos_laundry", "app.pos_service", "app.pos_product"));

// Filter options shared by every page under the Reports dropdown.
router.get("/options", requirePermission(...REPORT_PERMISSIONS), controller.reportFilterOptions);
router.get("/customer-search", requirePermission(...REPORT_PERMISSIONS), validate(reportCustomerSearchQuerySchema, "query"), controller.reportCustomerSearch);

// Reference's Reports > Daily Products Report (`daily_products_report` permission).
router.get("/daily-products", requirePermission("reports.daily_products"), validate(dailyProductsReportQuerySchema, "query"), controller.dailyProductsReport);
router.get("/daily-products/export", requirePermission("reports.daily_products"), validate(dailyProductsReportQuerySchema, "query"), controller.dailyProductsReportExport);
// Reference's Reports > Companies Report (`companies_report` permission).
router.get("/companies", requirePermission("reports.companies"), validate(companiesReportQuerySchema, "query"), controller.companiesReport);
router.get("/companies/export", requirePermission("reports.companies"), validate(companiesReportQuerySchema, "query"), controller.companiesReportExport);
// Reference's Reports > Detailed Companies Report (`detailed_companies_report` permission).
router.get("/detailed-companies", requirePermission("reports.detailed_companies"), validate(detailedCompaniesReportQuerySchema, "query"), controller.detailedCompaniesReport);
router.get("/detailed-companies/export", requirePermission("reports.detailed_companies"), validate(detailedCompaniesReportQuerySchema, "query"), controller.detailedCompaniesReportExport);
// Reference's Reports > Products Report (`products_report` permission).
router.get("/products", requirePermission("reports.products"), validate(productsReportQuerySchema, "query"), controller.productsReport);
router.get("/products/export", requirePermission("reports.products"), validate(productsReportQuerySchema, "query"), controller.productsReportExport);
// Reference's Reports > Detailed Sales Report (`detailed_sales_report` permission).
router.get("/detailed-sales", requirePermission("reports.detailed_sales"), validate(detailedSalesReportQuerySchema, "query"), controller.detailedSalesReport);
router.get("/detailed-sales/export", requirePermission("reports.detailed_sales"), validate(detailedSalesReportQuerySchema, "query"), controller.detailedSalesReportExport);
// Reference's Reports > Branches Sales Report (`branch_sales_report` permission).
router.get("/branch-sales", requirePermission("reports.branch_sales"), validate(branchSalesReportQuerySchema, "query"), controller.branchSalesReport);
router.get("/branch-sales/export", requirePermission("reports.branch_sales"), validate(branchSalesReportQuerySchema, "query"), controller.branchSalesReportExport);
// Reference's Reports > Tax Report (`tax_report.view` permission).
router.get("/tax", requirePermission("reports.tax"), validate(taxReportQuerySchema, "query"), controller.taxReport);
router.get("/tax/export", requirePermission("reports.tax"), validate(taxReportQuerySchema, "query"), controller.taxReportExport);
// Reference's Reports > Register Report (`register_report.view` permission).
router.get("/register", requirePermission("reports.register"), validate(registerReportQuerySchema, "query"), controller.registerReport);
router.get("/register/export", requirePermission("reports.register"), validate(registerReportQuerySchema, "query"), controller.registerReportExport);
// Reference's Reports > Compensations Report (`compensations_report` permission).
router.get("/compensations", requirePermission("reports.compensations"), validate(compensationsReportQuerySchema, "query"), controller.compensationsReport);
router.get("/compensations/export", requirePermission("reports.compensations"), validate(compensationsReportQuerySchema, "query"), controller.compensationsReportExport);
// Reference's Reports > Cash Back Report (`cashBack_report` permission).
router.get("/cashback", requirePermission("reports.cashback"), validate(cashbackReportQuerySchema, "query"), controller.cashbackReport);
router.get("/cashback/export", requirePermission("reports.cashback"), validate(cashbackReportQuerySchema, "query"), controller.cashbackReportExport);
// Reference's Reports > Loyality Points Report (`loyalityPoints_report` permission).
router.get("/loyalty-points", requirePermission("reports.loyalty_points"), validate(loyaltyPointsReportQuerySchema, "query"), controller.loyaltyPointsReport);
router.get("/loyalty-points/export", requirePermission("reports.loyalty_points"), validate(loyaltyPointsReportQuerySchema, "query"), controller.loyaltyPointsReportExport);
// Reference's Reports > Cash Register Report (`cashRegister_report` permission).
router.get("/cash-register", requirePermission("reports.cash_register"), validate(cashRegisterReportQuerySchema, "query"), controller.cashRegisterReport);
router.get("/cash-register/export", requirePermission("reports.cash_register"), validate(cashRegisterReportQuerySchema, "query"), controller.cashRegisterReportExport);
// Reference's Reports > Customer Visits Report (no permission check in the reference; gated here).
router.get("/customer-visits", requirePermission("reports.customer_visits"), validate(customerVisitsReportQuerySchema, "query"), controller.customerVisitsReport);
router.get("/customer-visits/export", requirePermission("reports.customer_visits"), validate(customerVisitsReportQuerySchema, "query"), controller.customerVisitsReportExport);
// Reference's Reports > Sales Report (`sales_report` permission). "/sales" below is this app's
// older summary endpoint used by the Reports Overview page.
router.get("/sales-report", requirePermission("reports.sales_report"), validate(salesReportV2QuerySchema, "query"), controller.salesReportV2);
router.get("/sales-report/export", requirePermission("reports.sales_report"), validate(salesReportV2QuerySchema, "query"), controller.salesReportV2Export);
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
