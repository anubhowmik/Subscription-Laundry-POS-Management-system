import { Route, Routes } from "react-router-dom";
import { ProtectedRoute, PermissionRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import HomePage from "./pages/home/HomePage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterOrganizationPage from "./pages/auth/RegisterOrganizationPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import PlatformLoginPage from "./pages/platform/PlatformLoginPage";
import PlatformConsolePage from "./pages/platform/PlatformConsolePage";
import { PlatformAuthProvider } from "./contexts/PlatformAuthContext";
import BillingPage from "./pages/billing/BillingPage";
import BillingCallbackPage from "./pages/billing/BillingCallbackPage";
import AppLandingPage from "./pages/appHome/AppLandingPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import PosPage from "./pages/pos/PosPage";
import QuotesPage from "./pages/quotes/QuotesPage";
import SalesPage from "./pages/sales/SalesPage";
import OrdersPage from "./pages/orders/OrdersPage";
import ShipmentsPage from "./pages/shipments/ShipmentsPage";
import ImportSalesPage from "./pages/importSales/ImportSalesPage";
import CustomersPage from "./pages/customers/CustomersPage";
import ProductsPage from "./pages/products/ProductsPage";
import ServicesPage from "./pages/services/ServicesPage";
import UsersPage from "./pages/users/UsersPage";
import RolesPage from "./pages/roles/RolesPage";
import ApplicationAccessPage from "./pages/applicationAccess/ApplicationAccessPage";
import LicensesPage from "./pages/licenses/LicensesPage";
import OrganizationSettingsPage from "./pages/settings/OrganizationSettingsPage";
import BusinessLocationsPage from "./pages/businessLocations/BusinessLocationsPage";
import CouponsPage from "./pages/coupons/CouponsPage";
import PriceListsPage from "./pages/priceLists/PriceListsPage";
import CustomerGroupsPage from "./pages/customerGroups/CustomerGroupsPage";
import ImportContactsPage from "./pages/importContacts/ImportContactsPage";
import ReportsPage from "./pages/reports/ReportsPage";
import DailyProductsReportPage from "./pages/reports/DailyProductsReportPage";
import CompaniesReportPage from "./pages/reports/CompaniesReportPage";
import DetailedCompaniesReportPage from "./pages/reports/DetailedCompaniesReportPage";
import ProductsReportPage from "./pages/reports/ProductsReportPage";
import SalesReportPage from "./pages/reports/SalesReportPage";
import DetailedSalesReportPage from "./pages/reports/DetailedSalesReportPage";
import BranchSalesReportPage from "./pages/reports/BranchSalesReportPage";
import TaxReportPage from "./pages/reports/TaxReportPage";
import RegisterReportPage from "./pages/reports/RegisterReportPage";
import CompensationsReportPage from "./pages/reports/CompensationsReportPage";
import CashbackReportPage from "./pages/reports/CashbackReportPage";
import LoyaltyPointsReportPage from "./pages/reports/LoyaltyPointsReportPage";
import CashRegisterReportPage from "./pages/reports/CashRegisterReportPage";
import CustomerVisitsReportPage from "./pages/reports/CustomerVisitsReportPage";
import DailySalesReportPage from "./pages/reports/DailySalesReportPage";
import LflSalesReportPage from "./pages/reports/LflSalesReportPage";
import SalesAnalysisReportPage from "./pages/reports/SalesAnalysisReportPage";
import SalesPerformanceReportPage from "./pages/reports/SalesPerformanceReportPage";
import CategoriesPage from "./pages/categories/CategoriesPage";
import StockAdjustmentsPage from "./pages/inventory/StockAdjustmentsPage";
import StockAdjustmentCreatePage from "./pages/inventory/StockAdjustmentCreatePage";
import StockTransfersPage from "./pages/inventory/StockTransfersPage";
import StockTransferCreatePage from "./pages/inventory/StockTransferCreatePage";
import CompensationsPage from "./pages/compensations/CompensationsPage";
import BookingsPage from "./pages/bookings/BookingsPage";
import NotificationSettingsPage from "./pages/notifications/NotificationSettingsPage";
import BnplSettingsPage from "./pages/bnpl/BnplSettingsPage";
import SellReturnsPage from "./pages/sellReturns/SellReturnsPage";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import PurchasesPage from "./pages/purchases/PurchasesPage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import InventoryPostingsPage from "./pages/inventoryPostings/InventoryPostingsPage";
import InventoryPostingFormPage from "./pages/inventoryPostings/InventoryPostingFormPage";
import ClassifiedSalesListPage from "./pages/inventoryPostings/ClassifiedSalesListPage";
import RegisterSessionsPage from "./pages/registerSessions/RegisterSessionsPage";
import MessagesPage from "./pages/messages/MessagesPage";
import AnnouncementsPage from "./pages/announcements/AnnouncementsPage";
import InvoicePage from "./pages/invoices/InvoicePage";
import SellReturnReceiptPage from "./pages/sellReturns/SellReturnReceiptPage";
import ChartOfAccountsPage from "./pages/accounting/ChartOfAccountsPage";
import JournalEntriesPage from "./pages/accounting/JournalEntriesPage";
import AccountingReportsPage from "./pages/accounting/AccountingReportsPage";
import PaymentAccountsPage from "./pages/paymentAccounts/PaymentAccountsPage";
import AccountBookPage from "./pages/paymentAccounts/AccountBookPage";
import SellPaymentsPage from "./pages/paymentAccounts/SellPaymentsPage";
import CashFlowPage from "./pages/paymentAccounts/CashFlowPage";
import PaymentAccountReportPage from "./pages/paymentAccounts/PaymentAccountReportPage";
import { BalanceSheetPage, TrialBalancePage } from "./pages/paymentAccounts/AccountReportsPages";
import InvoiceLayoutsPage from "./pages/settings/InvoiceLayoutsPage";
import ZatcaPage from "./pages/zatca/ZatcaPage";
import PublicQuotePage from "./pages/publicQuote/PublicQuotePage";
import NotFoundPage from "./pages/NotFoundPage";
import { ConfirmDialogHost } from "./components/ui/ConfirmDialogHost";

export default function App() {
  return (
    <>
    <Routes>
      {/* Always public - the app launcher. Renders differently for logged-out vs logged-in
          visitors (see HomePage itself), so it deliberately sits outside ProtectedRoute. */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterOrganizationPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Reference's own public "View Quote URL" link - no login, entirely outside
          ProtectedRoute/PermissionRoute (see backend routes/index.ts's matching ungated mount). */}
      <Route path="/q/:token" element={<PublicQuotePage />} />

      {/* Platform operator console - its own auth provider, entirely outside the company app. */}
      <Route
        path="/platform/login"
        element={
          <PlatformAuthProvider>
            <PlatformLoginPage />
          </PlatformAuthProvider>
        }
      />
      <Route
        path="/platform"
        element={
          <PlatformAuthProvider>
            <PlatformConsolePage />
          </PlatformAuthProvider>
        }
      />

      <Route element={<ProtectedRoute />}>
        {/* Billing sits outside AppLayout so it stays reachable even when the trial has lapsed
            and the main app would 402. */}
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/billing/callback" element={<BillingCallbackPage />} />

        <Route element={<PermissionRoute anyOf={["sales.view"]} />}>
          <Route path="/invoices/:saleId" element={<InvoicePage />} />
        </Route>

        {/* Print action's own destination (SellReturnsPage's row action) - sits outside AppLayout
            for the same print-friendly, sidebar-free reasons as /invoices/:saleId above. */}
        <Route element={<PermissionRoute anyOf={["sales.return"]} />}>
          <Route path="/sell-returns/:id/print" element={<SellReturnReceiptPage />} />
        </Route>

        <Route element={<AppLayout />}>
          {/* --- Pages shared by POS Laundry, Service POS, and Product POS ------------------- */}
          {/* Reachable from any of the three "laundry business" apps - channel-agnostic (a
              customer record, the cash drawer, a coupon, etc. don't care what was sold). Kept as
              one route group (rather than duplicated per app) so each page's fine-grained
              permission check below stays the single source of truth; only the outer app-level
              gate is wider than a single app. See Sidebar.tsx's deriveModeSections() for the
              client-side nav-list side of this same grouping. */}
          <Route element={<PermissionRoute anyOf={["app.pos_laundry", "app.pos_service", "app.pos_product"]} />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route element={<PermissionRoute anyOf={["sales.view"]} />}>
              <Route path="sales" element={<SalesPage />} />
              {/* The reference's own "List POS" (`SellPosController@index`) - the exact same
                  Sales list/columns as "All Sales" above, just scoped to sales rung up through
                  the POS screen (see schema.prisma's SaleChannel comment) - not a separate page
                  or dataset, hence reusing SalesPage itself rather than a new component. */}
              <Route path="sales/list-pos" element={<SalesPage key="list-pos" channel="POS" />} />
            </Route>
            {/* The reference's "Add Sale" (`sell/create.blade.php`) - a table/row-entry alternative
                to the touch-optimized POS grid, posting to the exact same checkout endpoint (see
                PosPage's `layout` prop and SaleLineTable's own comment) - not a separate feature. */}
            <Route element={<PermissionRoute anyOf={["sales.create"]} />}>
              <Route path="sales/create" element={<PosPage key="add-sale" layout="table" />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["sales.quote"]} />}>
              <Route path="quotes" element={<QuotesPage />} />
              {/* Reference's own "Add Delivery"/"List Deliveries" - the same DRAFT-sale list
                  page as Quotes, just isQuotation=false (see QuotesPage's own `kind` prop
                  comment) - not a separate page, matching the List POS precedent. */}
              <Route path="deliveries" element={<QuotesPage key="deliveries" kind="delivery" />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["sales.return"]} />}>
              <Route path="sell-returns" element={<SellReturnsPage />} />
            </Route>
            {/* Reference's own "Import Sales" (ImportSalesController) - reuses "sales.create"
                like Add Sale, matching the reference's own `sell.create` gate. */}
            <Route element={<PermissionRoute anyOf={["sales.create"]} />}>
              <Route path="import-sales" element={<ImportSalesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["customers.view"]} />}>
              <Route path="customers" element={<CustomersPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["customer_groups.view"]} />}>
              <Route path="customer-groups" element={<CustomerGroupsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["customers.create", "suppliers.manage"]} />}>
              <Route path="import-contacts" element={<ImportContactsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["expenses.view"]} />}>
              <Route path="expenses" element={<ExpensesPage />} />
            </Route>
            <Route
              element={
                <PermissionRoute
                  anyOf={["compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all"]}
                />
              }
            >
              <Route path="compensations" element={<CompensationsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["coupons.manage"]} />}>
              <Route path="coupons" element={<CouponsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["price-lists.manage"]} />}>
              <Route path="price-lists" element={<PriceListsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["pos.register.manage"]} />}>
              <Route path="register-sessions" element={<RegisterSessionsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.sales", "reports.inventory"]} />}>
              <Route path="reports" element={<ReportsPage />} />
            </Route>
            {/* The EJADA reference's Reports dropdown, one sub-report at a time (ReportController). */}
            <Route element={<PermissionRoute anyOf={["reports.daily_products"]} />}>
              <Route path="reports/daily-products" element={<DailyProductsReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.companies"]} />}>
              <Route path="reports/companies" element={<CompaniesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.detailed_companies"]} />}>
              <Route path="reports/detailed-companies" element={<DetailedCompaniesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.products"]} />}>
              <Route path="reports/products" element={<ProductsReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.sales_report"]} />}>
              <Route path="reports/sales-report" element={<SalesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.detailed_sales"]} />}>
              <Route path="reports/detailed-sales" element={<DetailedSalesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.branch_sales"]} />}>
              <Route path="reports/branch-sales" element={<BranchSalesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.tax"]} />}>
              <Route path="reports/tax" element={<TaxReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.register"]} />}>
              <Route path="reports/register" element={<RegisterReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.compensations"]} />}>
              <Route path="reports/compensations" element={<CompensationsReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.cashback"]} />}>
              <Route path="reports/cashback" element={<CashbackReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.loyalty_points"]} />}>
              <Route path="reports/loyalty-points" element={<LoyaltyPointsReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.cash_register"]} />}>
              <Route path="reports/cash-register" element={<CashRegisterReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.customer_visits"]} />}>
              <Route path="reports/customer-visits" element={<CustomerVisitsReportPage />} />
            </Route>
            {/* The EJADA reference's Sales Reports dropdown, one sub-report at a time. */}
            <Route element={<PermissionRoute anyOf={["reports.daily_sales"]} />}>
              <Route path="reports/daily-sales" element={<DailySalesReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.weekly_lfl_sales"]} />}>
              <Route path="reports/weekly-lfl-sales" element={<LflSalesReportPage key="week" period="week" />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.monthly_lfl_sales"]} />}>
              <Route path="reports/monthly-lfl-sales" element={<LflSalesReportPage key="month" period="month" />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.sales_analysis"]} />}>
              <Route path="reports/sales-analysis" element={<SalesAnalysisReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["reports.sales_performance"]} />}>
              <Route path="reports/sales-performance" element={<SalesPerformanceReportPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["categories.view", "services.view"]} />}>
              <Route path="categories" element={<CategoriesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["messages.manage"]} />}>
              <Route path="messages" element={<MessagesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["announcements.manage"]} />}>
              <Route path="announcements" element={<AnnouncementsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["business_locations.update"]} />}>
              <Route path="business-locations" element={<BusinessLocationsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["settings.manage"]} />}>
              <Route path="notifications" element={<NotificationSettingsPage />} />
              <Route path="organization-settings" element={<OrganizationSettingsPage />} />
              <Route path="invoice-layouts" element={<InvoiceLayoutsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["bnpl.manage"]} />}>
              <Route path="bnpl-settings" element={<BnplSettingsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["accounting.view"]} />}>
              <Route path="accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
              <Route path="accounting/journal-entries" element={<JournalEntriesPage />} />
              <Route path="accounting/reports" element={<AccountingReportsPage />} />
            </Route>
            {/* The EJADA reference's own "Payment Accounts" dropdown (AccountController /
                AccountReportsController / ReportController@sellPaymentReport). */}
            <Route element={<PermissionRoute anyOf={["payment_accounts.access"]} />}>
              <Route path="payment-accounts" element={<PaymentAccountsPage />} />
              <Route path="payment-accounts/balance-sheet" element={<BalanceSheetPage />} />
              <Route path="payment-accounts/trial-balance" element={<TrialBalancePage />} />
              <Route path="payment-accounts/cash-flow" element={<CashFlowPage />} />
              <Route path="payment-accounts/payment-account-report" element={<PaymentAccountReportPage />} />
              <Route path="payment-accounts/:id" element={<AccountBookPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["sell_payment_report.view", "payment_accounts.access"]} />}>
              <Route path="payment-accounts/sell-payments" element={<SellPaymentsPage />} />
            </Route>
          </Route>

          {/* --- Pages shared by POS Laundry and Service POS only (service-oriented) --------- */}
          <Route element={<PermissionRoute anyOf={["app.pos_laundry", "app.pos_service"]} />}>
            <Route element={<PermissionRoute anyOf={["bookings.manage"]} />}>
              <Route path="bookings" element={<BookingsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["services.view"]} />}>
              <Route path="services" element={<ServicesPage />} />
            </Route>
            {/* The fulfillment board ("what's still washing/ready/delivered") is a wash-pipeline
                concept - meaningless for a pure product sale - not just a generic order list. */}
            <Route element={<PermissionRoute anyOf={["sales.view"]} />}>
              <Route path="orders" element={<OrdersPage />} />
              {/* Reference's own "Shipments" list (SellController@shipments) - see
                  sale.service.ts's listShipments/computeShippingStatus. */}
              <Route path="shipments" element={<ShipmentsPage />} />
            </Route>
          </Route>

          {/* --- Pages shared by POS Laundry and Product POS only (inventory-oriented) ------- */}
          <Route element={<PermissionRoute anyOf={["app.pos_laundry", "app.pos_product"]} />}>
            <Route element={<PermissionRoute anyOf={["products.view"]} />}>
              <Route path="products" element={<ProductsPage />} />
            </Route>
            {/* Matches the EJADA reference's own separate "Stock Adjustment"/"Stock Transfers"
                dropdowns (each its own top-level menu, not a shared "Inventory" screen) - see
                Sidebar.tsx's stockAdjustments/stockTransfers NavSections. */}
            <Route element={<PermissionRoute anyOf={["inventory.view", "inventory.adjust"]} />}>
              <Route path="stock-adjustments" element={<StockAdjustmentsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory.adjust"]} />}>
              <Route path="stock-adjustments/create" element={<StockAdjustmentCreatePage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory.view", "inventory.transfer"]} />}>
              <Route path="stock-transfers" element={<StockTransfersPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory.transfer"]} />}>
              <Route path="stock-transfers/create" element={<StockTransferCreatePage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["suppliers.manage"]} />}>
              <Route path="suppliers" element={<SuppliersPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["purchases.manage"]} />}>
              <Route path="purchases" element={<PurchasesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory_postings.manage"]} />}>
              <Route path="inventory-postings" element={<InventoryPostingsPage />} />
              <Route path="inventory-postings/create" element={<InventoryPostingFormPage />} />
              <Route path="inventory-postings/inventory" element={<ClassifiedSalesListPage titleEn="Inventory" titleAr="المخزون" statusFilter="IN_STOCK,IN_WAREHOUSE" />} />
              <Route
                path="inventory-postings/warehouse-invoices"
                element={<ClassifiedSalesListPage titleEn="Warehouse Invoices" titleAr="فواتير المستودع" statusFilter="IN_WAREHOUSE" />}
              />
              <Route path="inventory-postings/:id" element={<InventoryPostingFormPage />} />
            </Route>
          </Route>

          {/* --- POS Laundry's own exclusive legacy combined POS screen ---------------------- */}
          {/* Every PosPage instance below gets an explicit `key` distinct from the other two -
              /pos/service and /pos/product are sibling routes rendering the SAME component type
              at the same tree position, so without a key React reconciles them as "the same"
              element on navigation and just updates props instead of remounting. That left both
              ProductGrid's internal tab state AND the global cart (posStore) stale after using
              POS Laundry's own quick links to jump straight from one POS mode to the other -
              caught live by doing exactly that and seeing "No services yet" while in Product
              mode. The key forces a clean remount (fresh cart, fresh tab) on every mode switch. */}
          <Route element={<PermissionRoute anyOf={["app.pos_laundry"]} />}>
            {/* The card-grid landing view (see AppLandingPage.tsx) - what Home's "POS Laundry"
                card now opens onto, ahead of Dashboard. Needs only the app-level gate: it's just
                a grid of links, each already gated individually where it's actually clicked. */}
            <Route path="pos-laundry" element={<AppLandingPage key="pos-laundry" />} />
            <Route element={<PermissionRoute anyOf={["pos.access"]} />}>
              <Route path="pos" element={<PosPage key="pos-legacy" />} />
            </Route>
          </Route>

          {/* --- Service POS application (separate from POS Laundry - its own Home card/sidebar) */}
          <Route element={<PermissionRoute anyOf={["app.pos_service"]} />}>
            <Route path="service-pos" element={<AppLandingPage key="service-pos" />} />
            <Route element={<PermissionRoute anyOf={["pos.access.service"]} />}>
              <Route path="pos/service" element={<PosPage key="pos-service" mode="SERVICE" />} />
            </Route>
          </Route>

          {/* --- Product POS application (separate from POS Laundry - its own Home card/sidebar) */}
          <Route element={<PermissionRoute anyOf={["app.pos_product"]} />}>
            <Route path="product-pos" element={<AppLandingPage key="product-pos" />} />
            <Route element={<PermissionRoute anyOf={["pos.access.product"]} />}>
              <Route path="pos/product" element={<PosPage key="pos-product" mode="PRODUCT" />} />
            </Route>
          </Route>

          {/* --- Users & Rules application -------------------------------------------------- */}
          <Route element={<PermissionRoute anyOf={["app.users_rules"]} />}>
            <Route path="users-rules" element={<AppLandingPage key="users-rules" />} />
            <Route element={<PermissionRoute anyOf={["users.view"]} />}>
              <Route path="users" element={<UsersPage />} />
              <Route path="application-access" element={<ApplicationAccessPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["roles.view"]} />}>
              <Route path="roles" element={<RolesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["licenses.manage"]} />}>
              <Route path="licenses" element={<LicensesPage />} />
            </Route>
          </Route>

          {/* --- ZATCA KSA application ------------------------------------------------------- */}
          <Route element={<PermissionRoute anyOf={["app.zatca"]} />}>
            <Route path="zatca" element={<ZatcaPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
    <ConfirmDialogHost />
    </>
  );
}
