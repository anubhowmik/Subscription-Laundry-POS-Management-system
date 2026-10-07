// Canonical permission registry. Used by the seed script (to populate the
// `Permission` table) and by the `requirePermission` middleware (as a
// compile-time reference for valid codes). Add new codes here as modules
// are built in later phases.

export interface PermissionDef {
  code: string;
  module: string;
  description: string;
}

const crud = (module: string, label: string): PermissionDef[] => [
  { code: `${module}.view`, module, description: `View ${label}` },
  { code: `${module}.create`, module, description: `Create ${label}` },
  { code: `${module}.update`, module, description: `Update ${label}` },
  { code: `${module}.delete`, module, description: `Delete ${label}` },
];

export const PERMISSIONS: PermissionDef[] = [
  ...crud("users", "users"),
  { code: "users.reset_password", module: "users", description: "Reset another user's password" },
  { code: "users.assign_role", module: "users", description: "Assign role to a user" },
  { code: "users.assign_location", module: "users", description: "Assign business locations to a user" },
  { code: "users.assign_customer", module: "users", description: "Restrict a user to specific customers or customer groups" },
  { code: "users.assign_transfer_location", module: "users", description: "Restrict which locations a user can transfer stock out of" },

  ...crud("roles", "roles"),
  ...crud("user_groups", "user groups"),
  ...crud("business_locations", "business locations"),
  ...crud("customers", "customers"),
  ...crud("customer_groups", "customer groups"),
  ...crud("products", "products"),
  ...crud("categories", "categories"),
  ...crud("brands", "brands"),
  ...crud("units", "units"),
  ...crud("taxes", "taxes"),
  ...crud("services", "services"),

  { code: "inventory.view", module: "inventory", description: "View inventory" },
  { code: "inventory.adjust", module: "inventory", description: "Adjust stock quantities" },
  { code: "inventory.transfer", module: "inventory", description: "Transfer stock between locations" },
  { code: "inventory.reverse_adjustment", module: "inventory", description: "Reverse a confirmed stock adjustment" },

  { code: "sales.view", module: "sales", description: "View sales" },
  { code: "sales.create", module: "sales", description: "Create sales" },
  { code: "sales.update", module: "sales", description: "Update sales" },
  { code: "sales.cancel", module: "sales", description: "Cancel sales" },
  { code: "sales.return", module: "sales", description: "Process sale returns" },
  { code: "sales.quote", module: "sales", description: "Create, confirm, and void quotes" },
  { code: "sales.delete", module: "sales", description: "Permanently delete draft quotes and deliveries" },

  { code: "pos.access", module: "pos", description: "Access the POS screen" },
  { code: "pos.access.service", module: "pos", description: "Access the Service POS screen" },
  { code: "pos.access.product", module: "pos", description: "Access the Product POS screen" },
  { code: "pos.register.manage", module: "pos", description: "Open and close the cash register" },
  { code: "coupons.manage", module: "pos", description: "Create and manage discount coupons" },
  { code: "price-lists.manage", module: "pos", description: "Create price lists and assign them to customers" },
  { code: "bnpl.manage", module: "pos", description: "Configure BNPL (Tamara/Tabby/MISPay) providers for the organization" },
  // Reference's own `edit_product_price_from_sale_screen` - a per-line unit price/tax override at
  // checkout, gated to managers by default (see defaultRoles.ts) since an unrestricted cashier
  // could otherwise discount arbitrarily by "correcting" the price instead of using the existing
  // (already-gated) discount field.
  { code: "pos.editLinePrice", module: "pos", description: "Override a line's unit price and tax at checkout (POS / Add Sale)" },

  { code: "reports.sales", module: "reports", description: "View sales reports" },
  { code: "reports.inventory", module: "reports", description: "View inventory reports" },
  { code: "reports.accounting", module: "reports", description: "View accounting reports" },

  { code: "accounting.view", module: "accounting", description: "View the Chart of Accounts and journal entries" },
  { code: "accounting.manage", module: "accounting", description: "Create/edit accounts and post journal entries" },

  { code: "compensations.file", module: "sales", description: "File lost/damaged/delayed item compensation claims" },
  { code: "compensations.approve", module: "sales", description: "Approve or reject pending compensation claims" },
  { code: "compensations.pay", module: "sales", description: "Mark approved compensation claims as paid" },
  { code: "compensations.view_own", module: "sales", description: "View compensation claims this user filed" },
  { code: "compensations.view_all", module: "sales", description: "View all compensation claims" },
  { code: "loyalty.manage", module: "customers", description: "Configure loyalty points and adjust customer balances" },
  { code: "cashback.manage", module: "customers", description: "Grant and adjust customer cashback balances" },
  { code: "customers.approve", module: "customers", description: "Approve or reject pending customer accounts" },
  { code: "bookings.manage", module: "sales", description: "Schedule and manage pickup/delivery bookings" },

  { code: "suppliers.manage", module: "purchasing", description: "Create and manage suppliers" },
  { code: "purchases.manage", module: "purchasing", description: "Receive stock from suppliers and process purchase returns" },
  ...crud("expenses", "expenses"),
  { code: "expense_categories.manage", module: "expenses", description: "Create and manage expense categories" },
  { code: "inventory_postings.manage", module: "inventory", description: "Create branch inventory posting reconciliations" },
  { code: "messages.manage", module: "messages", description: "Send and manage branch-to-branch messages" },
  { code: "announcements.manage", module: "announcements", description: "Create and manage company announcements" },

  { code: "reports.daily_products", module: "reports", description: "View the daily products report (per-branch quantity and amount for each item and category)" },
  { code: "reports.companies", module: "reports", description: "View the companies report (per-branch sales and returns, by customer group)" },
  { code: "reports.detailed_companies", module: "reports", description: "View the detailed companies report" },
  { code: "reports.products", module: "reports", description: "View the products report" },
  { code: "reports.sales_report", module: "reports", description: "View the sales report" },
  { code: "reports.detailed_sales", module: "reports", description: "View the detailed sales report" },
  { code: "reports.branch_sales", module: "reports", description: "View the branches sales report" },
  { code: "reports.tax", module: "reports", description: "View the tax report" },
  { code: "reports.register", module: "reports", description: "View the register report" },
  { code: "reports.compensations", module: "reports", description: "View the compensations report" },
  { code: "reports.cashback", module: "reports", description: "View the cashback report" },
  { code: "reports.loyalty_points", module: "reports", description: "View the loyalty points report" },
  { code: "reports.cash_register", module: "reports", description: "View the cash register report" },
  { code: "reports.customer_visits", module: "reports", description: "View the customer visits report" },
  { code: "payment_accounts.access", module: "payment_accounts", description: "Manage payment accounts, deposits, fund transfers and account reports" },
  { code: "payment_accounts.edit_transaction", module: "payment_accounts", description: "Edit opening balance, deposit and fund transfer movements" },
  { code: "payment_accounts.delete_transaction", module: "payment_accounts", description: "Delete deposit and fund transfer movements" },
  { code: "sell_payment_report.view", module: "payment_accounts", description: "View the sell payments report" },

  { code: "settings.manage", module: "settings", description: "Manage system settings" },

  // Application-level access gates for the Home launcher's five applications (POS Laundry /
  // Service POS / Product POS / Users & Rules / ZATCA KSA). Additive on top of, not a
  // replacement for, the fine-grained codes above - e.g. a user still needs both pos.access AND
  // app.pos_laundry to use the legacy combined POS screen, and both pos.access.service AND
  // app.pos_service for the dedicated Service POS screen. See middleware/authenticate.ts for how
  // a per-user Application Access override on top of these role-level grants is folded into
  // req.user.permissions.
  { code: "app.pos_laundry", module: "app", description: "Access the POS Laundry application" },
  { code: "app.pos_service", module: "app", description: "Access the Service POS application" },
  { code: "app.pos_product", module: "app", description: "Access the Product POS application" },
  { code: "app.users_rules", module: "app", description: "Access the Users & Rules application" },
  { code: "app.zatca", module: "app", description: "Access the ZATCA KSA application" },

  { code: "licenses.manage", module: "billing", description: "View and purchase additional user license seats" },
];
