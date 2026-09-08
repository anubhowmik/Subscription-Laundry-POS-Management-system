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
import ReportsPage from "./pages/reports/ReportsPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import CompensationsPage from "./pages/compensations/CompensationsPage";
import BookingsPage from "./pages/bookings/BookingsPage";
import NotificationSettingsPage from "./pages/notifications/NotificationSettingsPage";
import BnplSettingsPage from "./pages/bnpl/BnplSettingsPage";
import SellReturnsPage from "./pages/sellReturns/SellReturnsPage";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import PurchasesPage from "./pages/purchases/PurchasesPage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import InventoryPostingsPage from "./pages/inventoryPostings/InventoryPostingsPage";
import RegisterSessionsPage from "./pages/registerSessions/RegisterSessionsPage";
import MessagesPage from "./pages/messages/MessagesPage";
import AnnouncementsPage from "./pages/announcements/AnnouncementsPage";
import InvoicePage from "./pages/invoices/InvoicePage";
import ZatcaPage from "./pages/zatca/ZatcaPage";
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
            </Route>
            <Route element={<PermissionRoute anyOf={["sales.quote"]} />}>
              <Route path="quotes" element={<QuotesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["sales.return"]} />}>
              <Route path="sell-returns" element={<SellReturnsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["customers.view"]} />}>
              <Route path="customers" element={<CustomersPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["customer_groups.view"]} />}>
              <Route path="customer-groups" element={<CustomerGroupsPage />} />
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
            </Route>
            <Route element={<PermissionRoute anyOf={["bnpl.manage"]} />}>
              <Route path="bnpl-settings" element={<BnplSettingsPage />} />
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
            </Route>
          </Route>

          {/* --- Pages shared by POS Laundry and Product POS only (inventory-oriented) ------- */}
          <Route element={<PermissionRoute anyOf={["app.pos_laundry", "app.pos_product"]} />}>
            <Route element={<PermissionRoute anyOf={["products.view"]} />}>
              <Route path="products" element={<ProductsPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory.view", "inventory.adjust", "inventory.transfer"]} />}>
              <Route path="inventory" element={<InventoryPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["suppliers.manage"]} />}>
              <Route path="suppliers" element={<SuppliersPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["purchases.manage"]} />}>
              <Route path="purchases" element={<PurchasesPage />} />
            </Route>
            <Route element={<PermissionRoute anyOf={["inventory_postings.manage"]} />}>
              <Route path="inventory-postings" element={<InventoryPostingsPage />} />
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
