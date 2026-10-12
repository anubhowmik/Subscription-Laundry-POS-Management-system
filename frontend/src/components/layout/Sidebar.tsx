import { useEffect, useState, type ElementType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
  LayoutGrid,
  ShoppingCart,
  Receipt,
  Package,
  FileText,
  Undo2,
  CalendarClock,
  Users,
  UsersRound,
  ShoppingBasket,
  WashingMachine,
  ClipboardList,
  Truck,
  ShoppingBag,
  ClipboardCheck,
  Wallet,
  HandCoins,
  Tags,
  Archive,
  BarChart3,
  Mail,
  Megaphone,
  KeyRound,
  ShieldCheck,
  Fingerprint,
  Award,
  FileCheck2,
  Building2,
  Bell,
  Settings,
  CreditCard,
  Banknote,
  Handshake,
  Upload,
  BookOpen,
  ScrollText,
  Scale,
  LayoutTemplate,
  ChevronDown,
  X,
  PlusCircle,
  List,
  PackageCheck,
  Send,
  ArrowLeftRight,
  Warehouse,
  Landmark,
  ArrowRightLeft,
  PieChart,
  ArrowDownCircle,
  VenetianMask as UserSecret,
  BanknoteArrowDown as MoneyCheck,
  Briefcase,
  Percent,
  BadgePercent,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { useMobileNavStore } from "../../stores/mobileNavStore";
import { useCurrentAppStore } from "../../stores/currentAppStore";
import { PosLaundryIcon, ServicePosIcon, ProductPosIcon, UsersRulesIcon, ZatcaIcon } from "../appHome/AppIcons";
import { pickAccent } from "../../lib/cardPalette";

export interface NavItem {
  to: string;
  labelKey: string;
  permissions?: string[];
  icon: LucideIcon;
  /** Marks an item as exclusive to one POS mode's dedicated app (Service POS / Product POS), or
   * to POS Laundry itself ("laundry" - e.g. quick links into the other two apps, which would
   * otherwise duplicate those apps' own dedicated screen link when derived). Omitted means
   * shared, appearing in POS Laundry and both of the other two apps. See deriveModeSections()
   * below, which filters NAV_SECTIONS by this tag. Has no effect on POS Laundry itself, which
   * always shows every item regardless of tag. */
  only?: "service" | "product" | "laundry";
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
  /** Renders as a collapsible dropdown (icon + label + chevron, matching the EJADA reference
   * site's menu pattern) instead of an always-expanded flat list under a static caption. Starts
   * open automatically if one of its own items is the active route, otherwise starts closed.
   * Sections are converted to this one at a time as requested, not all at once - most sections
   * still use the plain always-expanded style below. */
  collapsible?: true;
  /** Required when `collapsible` is set - the dropdown header needs its own icon since it's a
   * real clickable row now, not just a caption. */
  icon?: LucideIcon;
}

const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "nav.section.overview",
    items: [
      // The card-grid landing view (see AppLandingPage.tsx) - tagged "laundry" so
      // deriveModeSections() below always drops it rather than carrying POS Laundry's own
      // /pos-laundry link into Service POS's/Product POS's derived sidebars, which each get
      // their own landing link prepended instead (see SERVICE_POS_SECTIONS/PRODUCT_POS_SECTIONS).
      { to: "/pos-laundry", labelKey: "nav.modules", icon: LayoutGrid, only: "laundry" },
      { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    ],
  },
  {
    // Quick link into Service POS from right inside POS Laundry - without it there's no way to
    // reach that selling screen without first going back to Home. Its own standalone section
    // (not nested inside Sales A/R below) so it reads as a primary destination, not a sales
    // sub-item. Tagged "laundry" so deriveModeSections() never pulls it into Service POS's/Product
    // POS's own derived sidebars, where it'd duplicate that app's own screen link (already
    // prepended into its Overview section) - so this section only ever renders inside POS Laundry.
    labelKey: "nav.section.servicePos",
    items: [{ to: "/pos/service", labelKey: "nav.posService", permissions: ["pos.access.service"], icon: ShoppingCart, only: "laundry" }],
  },
  {
    // Same as Service POS above, for the Product POS quick link.
    labelKey: "nav.section.productPos",
    items: [{ to: "/pos/product", labelKey: "nav.posProduct", permissions: ["pos.access.product"], icon: ShoppingBasket, only: "laundry" }],
  },
  {
    // Matches the EJADA reference site's "Sales A/R" dropdown exactly (its own sidebar labels
    // this section "Sales A/R" too, not just "Sales") - converted to the same collapsible-dropdown
    // format as Business Partners now that this section is actively growing (Round 25+ of the
    // ongoing Sales A/R cross-check adds List POS/POS/Add Delivery/List Deliveries/Add Quotation/
    // List Quotations/Shipments/Import Sales one at a time), rather than letting a flat list get
    // increasingly cluttered.
    labelKey: "nav.section.sales",
    collapsible: true,
    icon: Banknote,
    items: [
      { to: "/sales", labelKey: "nav.sales", permissions: ["sales.view"], icon: Receipt },
      { to: "/sales/create", labelKey: "nav.addSale", permissions: ["sales.create"], icon: PlusCircle },
      { to: "/sales/list-pos", labelKey: "nav.listPos", permissions: ["sales.view"], icon: List },
      // The reference's own `sale.pos_sale` sidebar item - a direct link to the touch-grid POS
      // screen itself, reusing the SAME icon as "Add Sale" (`fa-plus-circle` both times in the
      // reference - not a mismatch, the reference genuinely repeats it). "/pos" only exists under
      // the POS Laundry app (Service POS/Product POS use their own scoped /pos/service /
      // /pos/product screens instead), hence "laundry"-only like the quick links above.
      { to: "/pos", labelKey: "nav.posSale", permissions: ["pos.access"], icon: PlusCircle, only: "laundry" },
      // Reference's own "List Deliveries" (`lang_v1.list_drafts`) - the laundry intake/drop-off
      // ticket workflow (same DRAFT-sale mechanism as Quotes, see QuotesPage.tsx's `kind` prop).
      // No separate "Add Delivery" nav entry, matching Quotes' own precedent - "Save as Delivery"
      // is a button on Add Sale, not a distinct creation screen.
      { to: "/deliveries", labelKey: "nav.deliveries", permissions: ["sales.quote"], icon: PackageCheck },
      { to: "/quotes", labelKey: "nav.quotes", permissions: ["sales.quote"], icon: FileText },
      { to: "/sell-returns", labelKey: "nav.sellReturns", permissions: ["sales.return"], icon: Undo2 },
      // Reference's own "Shipments" list (SellController@shipments) - unlike Orders/Bookings
      // above, the reference keeps this one nested inside its own Sales A/R menu, so this stays
      // here rather than becoming a standalone section.
      { to: "/shipments", labelKey: "nav.shipments", permissions: ["sales.view"], icon: Send, only: "service" },
      // Reference's own "Import Sales" (ImportSalesController) - last item in its Sales A/R menu.
      { to: "/import-sales", labelKey: "nav.importSales", permissions: ["sales.create"], icon: Upload },
    ],
  },
  {
    // Matches the EJADA reference site's "Business Partners" module exactly: Suppliers,
    // Customers, Customer Groups, Import Contacts as one dropdown (that reference groups
    // suppliers with customers here, not under Products - see the memory note on this rebuild).
    labelKey: "nav.section.businessPartners",
    collapsible: true,
    icon: Handshake,
    items: [
      { to: "/suppliers", labelKey: "nav.suppliers", permissions: ["suppliers.manage"], icon: Truck, only: "product" },
      { to: "/customers", labelKey: "nav.customers", permissions: ["customers.view"], icon: Users },
      { to: "/customer-groups", labelKey: "nav.customerGroups", permissions: ["customer_groups.view"], icon: UsersRound },
      { to: "/import-contacts", labelKey: "nav.importContacts", permissions: ["customers.create", "suppliers.manage"], icon: Upload },
    ],
  },
  {
    // Reference's own "Orders" list - kept as its own standalone section right below Business
    // Partners rather than nested inside Sales A/R, matching Service POS's/Product POS's own
    // independence above.
    labelKey: "nav.section.orders",
    items: [{ to: "/orders", labelKey: "nav.orders", permissions: ["sales.view"], icon: Package, only: "service" }],
  },
  {
    // Reference's own "Bookings" list - pulled out of Sales A/R the same way Orders was above,
    // right after it.
    labelKey: "nav.section.bookings",
    items: [{ to: "/bookings", labelKey: "nav.bookings", permissions: ["bookings.manage"], icon: CalendarClock, only: "service" }],
  },
  {
    labelKey: "nav.section.catalogInventory",
    items: [
      { to: "/products", labelKey: "nav.products", permissions: ["products.view"], icon: ShoppingBasket, only: "product" },
      { to: "/services", labelKey: "nav.services", permissions: ["services.view"], icon: WashingMachine, only: "service" },
      // Reference: Products > Categories (taxonomies) - product and service categories, with sales targets.
      { to: "/categories", labelKey: "nav.categories", permissions: ["categories.view", "services.view"], icon: Tags },
      { to: "/purchases", labelKey: "nav.purchases", permissions: ["purchases.manage"], icon: ShoppingBag, only: "product" },
    ],
  },
  {
    // Matches the EJADA reference's own "Inventory Counting" dropdown (AdminSidebarMenu.php's
    // inventory_counting module) exactly - 4 items: Create/List Inventory Posting, plus its own
    // "Inventory" and "Warehouse Invoices" read-only lists (SellController@inventory /
    // @warehouse_invoices), both backed by ClassifiedSalesListPage with a different status filter.
    labelKey: "nav.section.inventoryCounting",
    collapsible: true,
    icon: ClipboardCheck,
    items: [
      { to: "/inventory-postings/create", labelKey: "nav.inventoryPostingsCreate", permissions: ["inventory_postings.manage"], icon: PlusCircle, only: "product" },
      { to: "/inventory-postings", labelKey: "nav.inventoryPostingsList", permissions: ["inventory_postings.manage"], icon: List, only: "product" },
      { to: "/inventory-postings/inventory", labelKey: "nav.inventoryPostingsInventory", permissions: ["inventory_postings.manage"], icon: PackageCheck, only: "product" },
      { to: "/inventory-postings/warehouse-invoices", labelKey: "nav.inventoryPostingsWarehouseInvoices", permissions: ["inventory_postings.manage"], icon: Warehouse, only: "product" },
    ],
  },
  {
    // Matches the EJADA reference's own "stock_adjustment" dropdown (StockAdjustmentController) -
    // a standalone top-level menu with its own List/Add items, not folded into a shared
    // "Inventory" screen the way this app used to combine it with Stock Transfers.
    labelKey: "nav.section.stockAdjustments",
    collapsible: true,
    icon: ClipboardList,
    items: [
      { to: "/stock-adjustments", labelKey: "nav.stockAdjustmentsList", permissions: ["inventory.view", "inventory.adjust"], icon: List, only: "product" },
      { to: "/stock-adjustments/create", labelKey: "nav.stockAdjustmentsAdd", permissions: ["inventory.adjust"], icon: PlusCircle, only: "product" },
    ],
  },
  {
    // Matches the EJADA reference's own "Stock transfers" dropdown (StockTransferController) -
    // likewise its own standalone menu, separate from Stock Adjustment above.
    labelKey: "nav.section.stockTransfers",
    collapsible: true,
    icon: ArrowLeftRight,
    items: [
      { to: "/stock-transfers", labelKey: "nav.stockTransfersList", permissions: ["inventory.view", "inventory.transfer"], icon: List, only: "product" },
      { to: "/stock-transfers/create", labelKey: "nav.stockTransfersAdd", permissions: ["inventory.transfer"], icon: PlusCircle, only: "product" },
    ],
  },
  {
    // The EJADA reference's own "Promotions" dropdown (AdminSidebarMenu.php, `addon.promotions`):
    // Promotions and Coupons together.
    labelKey: "nav.section.promotions",
    collapsible: true,
    icon: BadgePercent,
    items: [
      { to: "/promotions", labelKey: "nav.promotions", permissions: ["promotions.view"], icon: Percent },
      { to: "/coupons", labelKey: "nav.coupons", permissions: ["coupons.view", "coupons.manage"], icon: Percent },
      { to: "/discounts", labelKey: "nav.discounts", permissions: ["discount.access"], icon: Percent },
    ],
  },
  {
    labelKey: "nav.section.finance",
    items: [
      { to: "/expenses", labelKey: "nav.expenses", permissions: ["expenses.view"], icon: Wallet },
      { to: "/compensations", labelKey: "nav.compensations", permissions: ["compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all"], icon: HandCoins },
      { to: "/price-lists", labelKey: "nav.priceLists", permissions: ["price-lists.manage"], icon: Tags },
      { to: "/register-sessions", labelKey: "nav.registerSessions", permissions: ["pos.register.manage"], icon: Archive },
      { to: "/accounting/chart-of-accounts", labelKey: "nav.chartOfAccounts", permissions: ["accounting.view"], icon: BookOpen },
      { to: "/accounting/journal-entries", labelKey: "nav.journalEntries", permissions: ["accounting.view"], icon: ScrollText },
      { to: "/accounting/reports", labelKey: "nav.accountingReports", permissions: ["accounting.view"], icon: Scale },
    ],
  },
  {
    // Matches the EJADA reference's own "Reports" dropdown (AdminSidebarMenu.php, laundry branch),
    // rebuilt one sub-report at a time in the reference's own order: Daily Products Report first.
    // "Reports Overview" keeps this app's earlier combined report screen reachable until each of
    // its tabs is replaced by its reference counterpart.
    labelKey: "nav.section.reports",
    collapsible: true,
    icon: PieChart,
    items: [
      { to: "/reports/daily-products", labelKey: "nav.dailyProductsReport", permissions: ["reports.daily_products"], icon: ArrowDownCircle },
      { to: "/reports/companies", labelKey: "nav.companiesReport", permissions: ["reports.companies"], icon: ArrowDownCircle },
      { to: "/reports/detailed-companies", labelKey: "nav.detailedCompaniesReport", permissions: ["reports.detailed_companies"], icon: ArrowDownCircle },
      { to: "/reports/products", labelKey: "nav.productsReport", permissions: ["reports.products"], icon: ArrowDownCircle },
      { to: "/reports/sales-report", labelKey: "nav.salesReportV2", permissions: ["reports.sales_report"], icon: ArrowDownCircle },
      { to: "/reports/detailed-sales", labelKey: "nav.detailedSalesReport", permissions: ["reports.detailed_sales"], icon: UserSecret },
      { to: "/reports/branch-sales", labelKey: "nav.branchSalesReport", permissions: ["reports.branch_sales"], icon: UserSecret },
      { to: "/reports/tax", labelKey: "nav.taxReportV2", permissions: ["reports.tax"], icon: UserSecret },
      { to: "/reports/register", labelKey: "nav.registerReport", permissions: ["reports.register"], icon: Briefcase },
      { to: "/reports/compensations", labelKey: "nav.compensationsReport", permissions: ["reports.compensations"], icon: MoneyCheck },
      { to: "/reports/cashback", labelKey: "nav.cashbackReport", permissions: ["reports.cashback"], icon: MoneyCheck },
      { to: "/reports/loyalty-points", labelKey: "nav.loyaltyPointsReport", permissions: ["reports.loyalty_points"], icon: MoneyCheck },
      { to: "/reports/cash-register", labelKey: "nav.cashRegisterReport", permissions: ["reports.cash_register"], icon: MoneyCheck },
      { to: "/reports/customer-visits", labelKey: "nav.customerVisitsReport", permissions: ["reports.customer_visits"], icon: Users },
      { to: "/reports", labelKey: "nav.reportsOverview", permissions: ["reports.sales", "reports.inventory"], icon: BarChart3 },
    ],
  },
  {
    // The EJADA reference's "Sales Reports" dropdown (AdminSidebarMenu.php, `report.sales_reports`),
    // rebuilt one sub-report at a time in the reference's own order, all with its fa-percent icon.
    labelKey: "nav.section.salesReports",
    collapsible: true,
    icon: PieChart,
    items: [
      { to: "/reports/daily-sales", labelKey: "nav.dailySalesReport", permissions: ["reports.daily_sales"], icon: Percent },
      { to: "/reports/weekly-lfl-sales", labelKey: "nav.weeklyLflSalesReport", permissions: ["reports.weekly_lfl_sales"], icon: Percent },
      { to: "/reports/monthly-lfl-sales", labelKey: "nav.monthlyLflSalesReport", permissions: ["reports.monthly_lfl_sales"], icon: Percent },
      { to: "/reports/sales-analysis", labelKey: "nav.salesAnalysisReport", permissions: ["reports.sales_analysis"], icon: Percent },
      { to: "/reports/sales-performance", labelKey: "nav.salesPerformanceReport", permissions: ["reports.sales_performance"], icon: Percent },
    ],
  },
  {
    // The EJADA reference's "CRM Reports" dropdown (AdminSidebarMenu.php, `report.crm_reports`),
    // rebuilt one report at a time in the reference's order.
    labelKey: "nav.section.crmReports",
    collapsible: true,
    icon: PieChart,
    items: [
      { to: "/reports/customers-revenue", labelKey: "nav.customersRevenueReport", permissions: ["reports.customers_revenue"], icon: Percent },
      { to: "/reports/customers-retention", labelKey: "nav.customersRetentionReport", permissions: ["reports.customers_retention"], icon: Percent },
      { to: "/reports/decline-customers", labelKey: "nav.declineCustomersReport", permissions: ["reports.decline_customers"], icon: Percent },
      { to: "/reports/new-customers", labelKey: "nav.newCustomersReport", permissions: ["reports.new_customers"], icon: Percent },
      { to: "/reports/campaign-performance", labelKey: "nav.campaignPerformanceReport", permissions: ["reports.campaign_performance"], icon: Percent },
      { to: "/reports/discount-coupon", labelKey: "nav.discountCouponReport", permissions: ["reports.discount_coupon"], icon: Percent },
      { to: "/reports/consumer-behaviour", labelKey: "nav.consumerBehaviourReport", permissions: ["reports.consumer_behaviour"], icon: Percent },
    ],
  },
  {
    // Matches the EJADA reference's own "Payment Accounts" dropdown (AdminSidebarMenu.php's
    // `lang_v1.payment_accounts`, order 13) - its six items in the reference's own order and icons.
    // A separate system from the double-entry GL pages above (see schema.prisma's PaymentAccount).
    labelKey: "nav.section.paymentAccounts",
    collapsible: true,
    icon: Landmark,
    items: [
      { to: "/payment-accounts", labelKey: "nav.listAccounts", permissions: ["payment_accounts.access"], icon: List },
      { to: "/payment-accounts/sell-payments", labelKey: "nav.sellPayments", permissions: ["sell_payment_report.view", "payment_accounts.access"], icon: List },
      { to: "/payment-accounts/balance-sheet", labelKey: "nav.balanceSheet", permissions: ["payment_accounts.access"], icon: BookOpen },
      { to: "/payment-accounts/trial-balance", labelKey: "nav.trialBalance", permissions: ["payment_accounts.access"], icon: Scale },
      { to: "/payment-accounts/cash-flow", labelKey: "nav.cashFlow", permissions: ["payment_accounts.access"], icon: ArrowRightLeft },
      { to: "/payment-accounts/payment-account-report", labelKey: "nav.paymentAccountReport", permissions: ["payment_accounts.access"], icon: FileText },
    ],
  },
  {
    labelKey: "nav.section.communications",
    items: [
      { to: "/messages", labelKey: "nav.messages", permissions: ["messages.manage"], icon: Mail },
      { to: "/announcements", labelKey: "nav.announcements", permissions: ["announcements.manage"], icon: Megaphone },
    ],
  },
  {
    labelKey: "nav.section.settings",
    items: [
      { to: "/business-locations", labelKey: "nav.businessLocations", permissions: ["business_locations.update"], icon: Building2 },
      { to: "/notifications", labelKey: "nav.notifications", permissions: ["settings.manage"], icon: Bell },
      { to: "/bnpl-settings", labelKey: "nav.bnpl", permissions: ["bnpl.manage"], icon: Banknote },
      { to: "/invoice-layouts", labelKey: "nav.invoiceLayouts", permissions: ["settings.manage"], icon: LayoutTemplate },
      { to: "/organization-settings", labelKey: "nav.organizationSettings", permissions: ["settings.manage"], icon: Settings },
    ],
  },
];

// The Users & Rules and ZATCA KSA applications get their own top-level sidebar groups, separate
// from NAV_SECTIONS above (which is entirely the POS Laundry application's own navigation) - see
// App.tsx, where these routes are nested under their own app.users_rules/app.zatca
// PermissionRoute, matching this grouping.
const USERS_RULES_SECTION: NavSection = {
  labelKey: "nav.section.usersRules",
  items: [
    { to: "/users-rules", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/users", labelKey: "nav.users", permissions: ["users.view"], icon: KeyRound },
    { to: "/roles", labelKey: "nav.roles", permissions: ["roles.view"], icon: ShieldCheck },
    { to: "/application-access", labelKey: "nav.applicationAccess", permissions: ["users.view"], icon: Fingerprint },
    { to: "/licenses", labelKey: "nav.licenses", permissions: ["licenses.manage"], icon: Award },
    { to: "/billing", labelKey: "nav.subscription", permissions: ["licenses.manage"], icon: CreditCard },
  ],
};

const ZATCA_SECTION: NavSection = {
  labelKey: "nav.section.zatca",
  items: [{ to: "/zatca", labelKey: "nav.zatca", icon: FileCheck2 }],
};

// Service POS and Product POS carry every page POS Laundry has EXCEPT the other side's exclusive
// ones (see the `only` tags above) - derived from NAV_SECTIONS rather than hand-maintained as a
// second/third copy, so POS Laundry stays the single source of truth for "what pages exist and
// what permission each needs." Each app's own leading items (its landing grid, then its POS
// screen) are prepended into the existing Overview section since they're that app's primary
// actions - see the two call sites below.
function deriveModeSections(leadingItems: NavItem[], exclude: "service" | "product"): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    // "laundry"-tagged items (POS Laundry's own quick links into the other two apps, and its own
    // /pos-laundry landing link) are always dropped here regardless of which side is being
    // derived - they'd otherwise duplicate the leadingItems this function prepends into Overview.
    items: section.items.filter((item) => item.only !== exclude && item.only !== "laundry"),
  }))
    .filter((section) => section.items.length > 0)
    .map((section) => (section.labelKey === "nav.section.overview" ? { ...section, items: [...leadingItems, ...section.items] } : section));
}

const SERVICE_POS_SECTIONS: NavSection[] = deriveModeSections(
  [
    { to: "/service-pos", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/pos/service", labelKey: "nav.posService", permissions: ["pos.access.service"], icon: ShoppingCart },
  ],
  "product",
);

const PRODUCT_POS_SECTIONS: NavSection[] = deriveModeSections(
  [
    { to: "/product-pos", labelKey: "nav.modules", icon: LayoutGrid },
    { to: "/pos/product", labelKey: "nav.posProduct", permissions: ["pos.access.product"], icon: ShoppingBasket },
  ],
  "service",
);

// Each application is its OWN navigational shell - opening it from Home shows only that
// application's sidebar, never a combined mega-menu of everything the user can technically
// reach. Switching applications means going back to Home and picking a different card (the
// "Home" link below is always present for exactly that). This mirrors the app.pos_laundry /
// app.pos_service / app.pos_product / app.users_rules / app.zatca route grouping already
// enforced server-side in App.tsx - the path lists below are just the client-side "which app am
// I in" lookup for the same grouping.
export interface AppDef {
  key: "pos" | "posService" | "posProduct" | "usersRules" | "zatca";
  /** Same realistic multi-part illustration this app uses on its Home launcher card (see
   * appHome/AppIcons.tsx) - one consistent mark per app, not a plainer icon reserved for Home. */
  icon: ElementType<{ className?: string; color?: string }>;
  labelKey: string;
  sections: NavSection[];
  /** First path segment(s) that belong to this application, for detecting the current one from the URL. */
  paths: string[];
  /** Same per-app accent hex the Home launcher card cycles through (see lib/cardPalette.ts) -
   * assigned by this app's position here, matching Home's APPS order, so a given app carries the
   * same color in both places. Passed straight to the icon's `color` prop (these are hand-drawn
   * illustrations colored directly, not single-tone `currentColor` glyphs). */
  accentColor: string;
  activeNavClasses: string;
}

const APPS: AppDef[] = [
  {
    key: "pos",
    icon: PosLaundryIcon,
    labelKey: "home.apps.pos.name",
    sections: NAV_SECTIONS,
    // "pos" itself (the legacy combined POS screen) has no NAV_SECTIONS entry - deliberately
    // unlinked from the sidebar since Service POS/Product POS replaced it as the linked options -
    // but it must still resolve to the POS Laundry app when landed on directly (a bookmark, a
    // direct URL), or useCurrentApp() below finds no match and renders a blank sidebar shell.
    // "pos/service" and "pos/product" are deliberately EXCLUDED even though NAV_SECTIONS contains
    // quick-link items pointing at them (see those items' own comments) - those links exist so a
    // POS Laundry user can jump into the other two apps, they don't mean POS Laundry "owns" those
    // screens. Leaving them in this list used to create an exact tie in bestPathMatch() against
    // Service POS's/Product POS's own (correct) claim to their own screen - and since this app is
    // listed first in APPS, the tie always resolved here, snapping a fresh (non-Home-started)
    // visit to either app's own POS screen back to POS Laundry's sidebar instead.
    paths: [...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))).filter((p) => p !== "pos/service" && p !== "pos/product"), "pos"],
    accentColor: pickAccent(0),
    activeNavClasses: "bg-app-pos-50 text-app-pos-600",
  },
  {
    key: "posService",
    icon: ServicePosIcon,
    labelKey: "home.apps.posService.name",
    sections: SERVICE_POS_SECTIONS,
    paths: SERVICE_POS_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))),
    accentColor: pickAccent(1),
    activeNavClasses: "bg-app-posservice-50 text-app-posservice-600",
  },
  {
    key: "posProduct",
    icon: ProductPosIcon,
    labelKey: "home.apps.posProduct.name",
    sections: PRODUCT_POS_SECTIONS,
    paths: PRODUCT_POS_SECTIONS.flatMap((s) => s.items.map((i) => i.to.slice(1))),
    accentColor: pickAccent(2),
    activeNavClasses: "bg-app-posproduct-50 text-app-posproduct-600",
  },
  {
    key: "usersRules",
    icon: UsersRulesIcon,
    labelKey: "home.apps.usersRules.name",
    sections: [USERS_RULES_SECTION],
    paths: USERS_RULES_SECTION.items.map((i) => i.to.slice(1)),
    accentColor: pickAccent(3),
    activeNavClasses: "bg-app-users-50 text-app-users-600",
  },
  {
    key: "zatca",
    icon: ZatcaIcon,
    labelKey: "home.apps.zatca.name",
    sections: [ZATCA_SECTION],
    paths: ZATCA_SECTION.items.map((i) => i.to.slice(1)),
    accentColor: pickAccent(4),
    activeNavClasses: "bg-app-zatca-50 text-app-zatca-600",
  },
];

function matchesPath(app: AppDef, cleanPath: string): boolean {
  return app.paths.some((p) => p === cleanPath || cleanPath.startsWith(`${p}/`));
}

// Picks the MOST SPECIFIC matching path across every app, not just the first app that matches at
// all. Needed because several apps can legitimately share a path (e.g. "customers" is shared by
// POS Laundry, Service POS and Product POS; "pos" is a prefix of both "pos/service" and
// "pos/product") - a first-match-wins scan would always resolve to whichever app happens to be
// listed first in APPS, regardless of which one is actually the better fit. Used only as the
// fallback when there's no sticky app (see useCurrentApp below) or the sticky one no longer fits.
function bestPathMatch(cleanPath: string): AppDef | undefined {
  let best: { app: AppDef; path: string } | undefined;
  for (const app of APPS) {
    for (const p of app.paths) {
      if ((p === cleanPath || cleanPath.startsWith(`${p}/`)) && (!best || p.length > best.path.length)) {
        best = { app, path: p };
      }
    }
  }
  return best?.app;
}

// Exported so pages shared across apps (e.g. ReportsPage) can adapt their own content to which
// app they're being viewed from - the alternative (each such page re-deriving "which app" itself)
// would duplicate this exact sticky+fallback logic and risk drifting out of sync with it.
export function useCurrentApp(): AppDef | undefined {
  const { pathname } = useLocation();
  const cleanPath = pathname.replace(/^\//, "");
  const stickyKey = useCurrentAppStore((s) => s.appKey);

  // Sticky: once you've opened an app from Home, its sidebar stays even when you browse into a
  // page shared with other apps (e.g. Customers) - without this, a shared page would always
  // resolve to whichever app bestPathMatch() prefers, snapping the sidebar to the wrong app the
  // moment you left that app's exclusive pages. Only trusted when the stored app actually
  // contains the current page - otherwise (direct link, a stale value from before a permission
  // change, or a browser-back that crossed an app boundary) fall back to the URL-derived guess.
  const stickyApp = stickyKey ? APPS.find((app) => app.key === stickyKey) : undefined;
  if (stickyApp && matchesPath(stickyApp, cleanPath)) return stickyApp;

  return bestPathMatch(cleanPath);
}

function SidebarHeader({ currentApp, onClose }: { currentApp: AppDef | undefined; onClose?: () => void }) {
  const { t } = useTranslation();
  const AppIcon = currentApp?.icon ?? LayoutDashboard;
  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5">
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2">
          <AppIcon className="h-5 w-5 shrink-0" color={currentApp?.accentColor ?? "#263BAA"} />
          <span className="truncate text-[15px] font-semibold text-slate-900">
            {currentApp ? t(currentApp.labelKey) : t("app.name")}
          </span>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

function NavItemLink({
  item,
  currentApp,
  unreadCount,
  onNavigate,
}: {
  item: NavItem;
  currentApp: AppDef | undefined;
  unreadCount: number | undefined;
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          isActive ? (currentApp?.activeNavClasses ?? "bg-sky-50 text-sky-700") : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
      <span className="flex-1 truncate">{t(item.labelKey)}</span>
      {item.to === "/messages" && Boolean(unreadCount) && (
        <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span>
      )}
    </NavLink>
  );
}

function SidebarNav({ currentApp, onNavigate }: { currentApp: AppDef | undefined; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { pathname } = useLocation();
  // Only tracks sections the user has explicitly toggled - a section with no override here still
  // auto-opens whenever it's the active one (see isOpen below), it just isn't PINNED open once you
  // navigate away from it.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const { data: unreadCount } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: async () => (await api.get<ApiSuccess<{ count: number }>>("/messages/unread-count")).data.data.count,
    enabled: can("messages.manage"),
    refetchInterval: 60_000,
  });

  const cleanPath = pathname.replace(/^\//, "");

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <NavLink
        to="/"
        onClick={onNavigate}
        className="mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Home className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
        <span>{t("nav.home")}</span>
      </NavLink>

      {(currentApp?.sections ?? []).map((section) => {
        const items = section.items.filter((item) => !item.permissions || can(...item.permissions));
        if (items.length === 0) return null;

        if (!section.collapsible) {
          return (
            <div key={section.labelKey}>
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {t(section.labelKey)}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavItemLink key={item.to} item={item} currentApp={currentApp} unreadCount={unreadCount} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        }

        const isActiveSection = items.some((item) => {
          const itemPath = item.to.slice(1);
          return cleanPath === itemPath || cleanPath.startsWith(`${itemPath}/`);
        });
        const isOpen = openOverrides[section.labelKey] ?? isActiveSection;
        const SectionIcon = section.icon ?? LayoutGrid;

        return (
          <div key={section.labelKey}>
            {/* Standard accordion treatment: the header stays neutral (gray hover/pressed) like
                any other toggle - it's the currently-active PAGE inside that gets the app's accent
                color via NavItemLink below, not the section header itself just for being open.
                A bold label is the only "you're inside this section" cue, matching the plain,
                low-chrome pattern most admin/ERP sidebars use (GitHub, Linear, Zoho Books) rather
                than tinting the whole row. */}
            <button
              type="button"
              onClick={() => setOpenOverrides((prev) => ({ ...prev, [section.labelKey]: !isOpen }))}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-slate-100",
                isActiveSection ? "font-semibold text-slate-900" : "font-medium text-slate-600 hover:text-slate-900",
              )}
            >
              <SectionIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
              <span className="flex-1 truncate text-start">{t(section.labelKey)}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {/* Animated via grid-template-rows (0fr -> 1fr) rather than a hard show/hide - the
                overflow-hidden inner wrapper is what actually clips content during the transition,
                since a `grid-rows-[0fr]` track alone doesn't clip its child. */}
            <div className={cn("grid transition-[grid-template-rows] duration-200 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="overflow-hidden">
                <div className="ms-[19px] mt-0.5 space-y-0.5 border-s border-slate-200 ps-3.5">
                  {items.map((item) => (
                    <NavItemLink key={item.to} item={item} currentApp={currentApp} unreadCount={unreadCount} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const currentApp = useCurrentApp();
  const { pathname } = useLocation();
  const isOpen = useMobileNavStore((s) => s.isOpen);
  const close = useMobileNavStore((s) => s.close);

  // Navigating (via a link click, or a route change from anywhere else) always closes the
  // mobile drawer - nothing should be left covering the screen after the user picks a page.
  useEffect(() => close(), [pathname, close]);

  return (
    <>
      {/* Desktop: a static column, always visible at md+. */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-slate-200 bg-white md:flex">
        <SidebarHeader currentApp={currentApp} />
        <SidebarNav currentApp={currentApp} />
      </aside>

      {/* Mobile: an overlay drawer, opened via the Topbar hamburger (see useMobileNavStore) -
          below md, Sidebar renders nothing until this is open. */}
      {isOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={close} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <SidebarHeader currentApp={currentApp} onClose={close} />
            <SidebarNav currentApp={currentApp} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  );
}
