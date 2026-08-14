// Default role set created for every new Organization at signup. Previously this lived only
// in prisma/seed.ts (a one-time global seed); now every tenant gets their own copy of these
// roles (each Role row is organization-scoped), so it's shared here between the org
// registration flow and the dev seed script.

export interface RoleDef {
  nameEn: string;
  nameAr: string;
  isSystem?: boolean;
  permissions: "ALL" | string[];
}

export const ROLE_DEFS: RoleDef[] = [
  { nameEn: "System Admin", nameAr: "مدير النظام", isSystem: true, permissions: "ALL" },
  { nameEn: "Admin", nameAr: "مدير", permissions: "ALL" },
  {
    nameEn: "Store Manager",
    nameAr: "مدير الفرع",
    permissions: [
      "users.view",
      "customers.view",
      "customers.create",
      "customers.update",
      "customer_groups.view",
      "customer_groups.create",
      "customer_groups.update",
      "products.view",
      "services.view",
      "inventory.view",
      "inventory.adjust",
      "sales.view",
      "sales.create",
      "sales.update",
      "sales.cancel",
      "sales.return",
      "sales.quote",
      "pos.access",
      "pos.register.manage",
      "coupons.manage",
      "price-lists.manage",
      "compensations.file",
      "compensations.approve",
      "compensations.pay",
      "compensations.view_all",
      "loyalty.manage",
      "bookings.manage",
      "suppliers.manage",
      "purchases.manage",
      "inventory_postings.manage",
      "messages.manage",
      "announcements.manage",
      "reports.sales",
      "reports.inventory",
    ],
  },
  {
    nameEn: "Manager Assistant",
    nameAr: "مساعد مدير",
    permissions: ["customers.view", "customers.create", "products.view", "services.view", "inventory.view", "sales.view", "sales.create", "pos.access", "pos.register.manage"],
  },
  { nameEn: "Accountant", nameAr: "محاسب", permissions: ["customers.view", "sales.view", "reports.sales", "reports.accounting"] },
  {
    nameEn: "Cashier",
    nameAr: "أمين الصندوق",
    permissions: ["customers.view", "customers.create", "products.view", "services.view", "sales.view", "sales.create", "sales.quote", "pos.access", "pos.register.manage", "bookings.manage", "messages.manage"],
  },
  {
    nameEn: "Inventory Keeper",
    nameAr: "أمين المخزون",
    permissions: ["products.view", "inventory.view", "inventory.adjust", "inventory.transfer", "suppliers.manage", "purchases.manage", "inventory_postings.manage", "reports.inventory"],
  },
  { nameEn: "Call Center", nameAr: "مركز الاتصال", permissions: ["customers.view", "customers.create", "customers.update", "sales.view", "bookings.manage"] },
  { nameEn: "Data Entry", nameAr: "إدخال البيانات", permissions: ["customers.view", "customers.create", "products.view"] },
  { nameEn: "Factory", nameAr: "المصنع", permissions: ["sales.view", "services.view"] },
  { nameEn: "Factory Compensation", nameAr: "تعويضات المصنع", permissions: ["sales.view", "compensations.file", "compensations.view_own"] },
  { nameEn: "Sales Commission Agent", nameAr: "وكيل عمولة المبيعات", permissions: ["sales.view", "customers.view"] },
  { nameEn: "User", nameAr: "مستخدم", permissions: [] },
];
