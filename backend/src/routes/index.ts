import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import businessLocationRoutes from "../modules/businessLocations/businessLocation.routes";
import businessLocationGroupRoutes from "../modules/businessLocationGroups/businessLocationGroup.routes";
import customerGroupRoutes from "../modules/customerGroups/customerGroup.routes";
import customerRoutes from "../modules/customers/customer.routes";
import categoryRoutes from "../modules/categories/category.routes";
import brandRoutes from "../modules/brands/brand.routes";
import unitRoutes from "../modules/units/unit.routes";
import taxRoutes from "../modules/taxes/tax.routes";
import productRoutes from "../modules/products/product.routes";
import serviceRoutes from "../modules/services/service.routes";
import serviceCategoryRoutes from "../modules/serviceCategories/serviceCategory.routes";
import saleRoutes from "../modules/sales/sale.routes";
import posRoutes from "../modules/pos/pos.routes";
import registerSessionRoutes from "../modules/registerSessions/registerSession.routes";
import couponRoutes from "../modules/coupons/coupon.routes";
import priceListRoutes from "../modules/priceLists/priceList.routes";
import reportsRoutes from "../modules/reports/reports.routes";
import inventoryRoutes from "../modules/inventory/inventory.routes";
import compensationRoutes from "../modules/compensations/compensation.routes";
import loyaltyRoutes from "../modules/loyalty/loyalty.routes";
import cashbackRoutes from "../modules/cashback/cashback.routes";
import bookingRoutes from "../modules/bookings/booking.routes";
import notificationRoutes from "../modules/notifications/notifications.routes";
import sellReturnRoutes from "../modules/sellReturns/sellReturn.routes";
import supplierRoutes from "../modules/suppliers/supplier.routes";
import purchaseRoutes from "../modules/purchases/purchase.routes";
import expenseRoutes from "../modules/expenses/expense.routes";
import inventoryPostingRoutes from "../modules/inventoryPostings/inventoryPosting.routes";
import messageRoutes from "../modules/messages/message.routes";
import announcementRoutes from "../modules/announcements/announcement.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import userRoutes from "../modules/users/user.routes";
import roleRoutes from "../modules/roles/role.routes";
import permissionRoutes from "../modules/permissions/permission.routes";
import paymentMethodRoutes from "../modules/paymentMethods/paymentMethod.routes";
import zatcaCertificateRoutes from "../modules/zatca/certificate.routes";
import organizationRoutes from "../modules/organizations/organization.routes";
import platformRoutes from "../modules/platform/platform.routes";
import billingRoutes from "../modules/billing/billing.routes";
import { authenticate } from "../middleware/authenticate";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";

const router = Router();

// --- Ungated -----------------------------------------------------------------------------
// These must stay reachable without a subscription, otherwise a company whose trial lapsed
// could not log in, see why they are locked out, or pay to unlock themselves.
router.use("/auth", authRoutes);
router.use("/organizations", organizationRoutes);

// Platform operator console. Entirely separate auth realm - it must be mounted OUTSIDE the
// tenant paywall below, since the operator has no Organization and therefore no subscription.
router.use("/platform", platformRoutes);

// Billing is authenticated but NOT paywalled - a company with an expired trial has to reach it
// to subscribe. It enforces its own auth internally.
router.use("/billing", billingRoutes);

// --- Paywall -----------------------------------------------------------------------------
// Everything mounted below requires an authenticated user whose organization has an active
// trial or paid subscription. Feature routers still mount `authenticate` themselves; it is
// idempotent, so the second call is a no-op rather than a second database query.
router.use(authenticate, requireActiveSubscription);

router.use("/business-locations", businessLocationRoutes);
router.use("/business-location-groups", businessLocationGroupRoutes);
router.use("/customer-groups", customerGroupRoutes);
router.use("/customers", customerRoutes);
router.use("/categories", categoryRoutes);
router.use("/brands", brandRoutes);
router.use("/units", unitRoutes);
router.use("/taxes", taxRoutes);
router.use("/products", productRoutes);
router.use("/services", serviceRoutes);
router.use("/service-categories", serviceCategoryRoutes);
router.use("/sales", saleRoutes);
router.use("/pos", posRoutes);
router.use("/register-sessions", registerSessionRoutes);
router.use("/coupons", couponRoutes);
router.use("/price-lists", priceListRoutes);
router.use("/reports", reportsRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/compensations", compensationRoutes);
router.use("/loyalty", loyaltyRoutes);
router.use("/cashback", cashbackRoutes);
router.use("/bookings", bookingRoutes);
router.use("/notifications", notificationRoutes);
router.use("/sell-returns", sellReturnRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/purchases", purchaseRoutes);
router.use("/expenses", expenseRoutes);
router.use("/inventory-postings", inventoryPostingRoutes);
router.use("/messages", messageRoutes);
router.use("/announcements", announcementRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/permissions", permissionRoutes);
router.use("/payment-methods", paymentMethodRoutes);
router.use("/zatca/certificates", zatcaCertificateRoutes);

export default router;
