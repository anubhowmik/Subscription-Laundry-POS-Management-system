import { Route, Routes } from "react-router-dom";
import { ProtectedRoute, PermissionRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import RegisterOrganizationPage from "./pages/auth/RegisterOrganizationPage";
import PlatformLoginPage from "./pages/platform/PlatformLoginPage";
import PlatformConsolePage from "./pages/platform/PlatformConsolePage";
import { PlatformAuthProvider } from "./contexts/PlatformAuthContext";
import BillingPage from "./pages/billing/BillingPage";
import BillingCallbackPage from "./pages/billing/BillingCallbackPage";
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
import SellReturnsPage from "./pages/sellReturns/SellReturnsPage";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import PurchasesPage from "./pages/purchases/PurchasesPage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import InventoryPostingsPage from "./pages/inventoryPostings/InventoryPostingsPage";
import RegisterSessionsPage from "./pages/registerSessions/RegisterSessionsPage";
import MessagesPage from "./pages/messages/MessagesPage";
import AnnouncementsPage from "./pages/announcements/AnnouncementsPage";
import InvoicePage from "./pages/invoices/InvoicePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterOrganizationPage />} />

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
          <Route index element={<DashboardPage />} />

          <Route element={<PermissionRoute anyOf={["pos.access"]} />}>
            <Route path="pos" element={<PosPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["sales.view"]} />}>
            <Route path="sales" element={<SalesPage />} />
            <Route path="orders" element={<OrdersPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["sales.quote"]} />}>
            <Route path="quotes" element={<QuotesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["sales.return"]} />}>
            <Route path="sell-returns" element={<SellReturnsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["suppliers.manage"]} />}>
            <Route path="suppliers" element={<SuppliersPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["purchases.manage"]} />}>
            <Route path="purchases" element={<PurchasesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["expenses.view"]} />}>
            <Route path="expenses" element={<ExpensesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["inventory_postings.manage"]} />}>
            <Route path="inventory-postings" element={<InventoryPostingsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["pos.register.manage"]} />}>
            <Route path="register-sessions" element={<RegisterSessionsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["messages.manage"]} />}>
            <Route path="messages" element={<MessagesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["announcements.manage"]} />}>
            <Route path="announcements" element={<AnnouncementsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["customers.view"]} />}>
            <Route path="customers" element={<CustomersPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["products.view"]} />}>
            <Route path="products" element={<ProductsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["services.view"]} />}>
            <Route path="services" element={<ServicesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["users.view"]} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["roles.view"]} />}>
            <Route path="roles" element={<RolesPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["business_locations.update"]} />}>
            <Route path="business-locations" element={<BusinessLocationsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["coupons.manage"]} />}>
            <Route path="coupons" element={<CouponsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["price-lists.manage"]} />}>
            <Route path="price-lists" element={<PriceListsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["customer_groups.view"]} />}>
            <Route path="customer-groups" element={<CustomerGroupsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["reports.sales", "reports.inventory"]} />}>
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["inventory.view", "inventory.adjust", "inventory.transfer"]} />}>
            <Route path="inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all"]} />}>
            <Route path="compensations" element={<CompensationsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["bookings.manage"]} />}>
            <Route path="bookings" element={<BookingsPage />} />
          </Route>
          <Route element={<PermissionRoute anyOf={["settings.manage"]} />}>
            <Route path="notifications" element={<NotificationSettingsPage />} />
            <Route path="organization-settings" element={<OrganizationSettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
