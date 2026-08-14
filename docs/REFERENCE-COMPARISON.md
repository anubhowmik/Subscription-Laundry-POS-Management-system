# Reference System Comparison — Al Rahden POS vs. Our System

**Purpose:** Line-by-line comparison of the reference site (`pos.alrahden.com.sa`, source extracted to
`D:\Claude\reference-source`) against our Saudi Laundry Management System, to find every gap and
behavioral difference. This is a living document, updated incrementally as modules are reviewed.

**Ground rule:** We are NOT changing our stack (Node/Express/Prisma/React). This document is purely
about matching *behavior*, not porting PHP code.

**Reference stack (context only):** Laravel PHP, MySQL, jQuery/Bootstrap admin theme + DataTables.
This is **not a custom-built laundry app** — it's a full commercial multi-tenant POS/ERP platform
(the "UltimatePOS"/IsleBiz family of CodeCanyon products) configured for this laundry business. It
ships with entire feature sets irrelevant to laundry (Restaurant/Kitchen Display, EJADA
pharmacy/healthcare module, generic e-commerce API, warranties/serials, market tracking) which are
explicitly OUT OF SCOPE for this audit per user direction — we're only comparing laundry-relevant
modules.

**Audit status:** Complete for all laundry-relevant modules (§1–§20). SAP B1 (§4) is deliberately
deferred to the absolute last task per explicit instruction. See the **Final Prioritized Punch List**
at the bottom for the synthesized, ranked backlog this audit produced.

---

## 1. Business Locations (Branches) — DEEP DIVE

### 1.1 Schema — what a `business_locations` row actually holds

Reconstructed from `create_business_locations_table` + ~18 additive migrations through 2024:

| Field | Type | Purpose | Do we have it? |
|---|---|---|---|
| `business_id` | FK | tenant (their "Business" = our "Organization") | ✅ organizationId |
| `group_id` | FK → business_location_groups | groups branches (e.g. by city: Riyadh/Jeddah/Qassim/Dammam) | ❌ no grouping concept |
| `location_id` | string | a *display code* distinct from the numeric PK, e.g. `RYD-9`, `JDH-1` — shown as "Branch Name (CODE)" everywhere | ⚠️ we have `branchCode` but don't display it inline like this |
| `name` / `name_ar` | string | branch name, bilingual | ✅ branchName (single, not bilingual — see gap below) |
| `landmark`, `country`, `state`, `city`, `zip_code` | address fields | ✅ we have address/city/district/postalCode (no landmark, no separate country/state) |
| `crn` | string | commercial registration number (added 2024-03, ZATCA-adjacent) | ✅ crNumber |
| `building_no` | string | ZATCA national-address building number | ❌ not tracked — **real gap**, ZATCA national address needs this |
| `invoice_scheme_id` | FK | numbering scheme for this branch's invoices | ❌ we use a single global invoice numbering scheme (INV-000001...) |
| `invoice_layout_id`, `sale_invoice_layout_id`, `return_layout_id`, `return_pos_layout_id` | FK×4 | **different print templates per transaction type** (sale form vs POS receipt vs sell-return) — all per-branch | ❌ we have one hardcoded receipt/invoice layout, no per-branch customization |
| `selling_price_group_id` | FK | default price tier for this branch | ⚠️ we have PriceList assigned per-customer/group, not per-branch default |
| `receipt_printer_type` (`browser`/`printer`) + `printer_id` | | physical printer config per branch | ❌ not built — we only do browser print |
| `mobile`, `alternate_number`, `email`, `website` | | branch contact info | ⚠️ we have `phone`/`email` only |
| `featured_products` (JSON array) | | POS quick-add tiles specific to this branch | ❌ not built |
| `is_active` + soft-delete | | ✅ we have `status: ACTIVE/INACTIVE` (no separate soft-delete) |
| `sapb1_id` | string(8) | SAP B1 branch code this location maps to | ❌ no SAP integration at all (see §5) |
| `Sapb1_dimensions` (JSON) | | SAP cost-center mapping per branch | ❌ |
| `default_payment_accounts` (JSON) | | maps payment methods (cash/card/bank/cheque) → specific accounting Chart-of-Accounts entries **per branch**, incl. a special "advance" account | ❌ we have global PaymentMethod records, not per-branch account routing |
| `carpet_payment_accounts` (added Dec 2024) | | a **separate** payment-account routing for "Carpet Service" as a distinct revenue line, per branch | ❌ n/a — but signals the reference client treats carpet cleaning as its own revenue stream at the accounting level |
| `customer_group_id` | FK | default customer group for this branch (walk-ins) | ❌ not built |
| `default_shipping_status` | enum | default value for a transaction-level shipping/fulfillment status | ⚠️ different model — see §1.3 |
| `contact_id` (nullable) | FK → contacts | a branch can have an associated default Contact/Business-Partner (used for consolidated billing routing) | ❌ not built |
| `EJADA_ERP_ID` etc. | | pharmacy-module fields | out of scope |

**Real gaps worth flagging:** bilingual branch name (`name_ar`), `building_no` for ZATCA national
address, per-branch invoice/receipt layouts, per-branch default price group, per-branch payment
printer config, per-branch payment-account routing for accounting.

### 1.2 Branch grouping (`business_location_groups`)

A separate lightweight table: `{id, business_id, name, sap_warehouse_id, sapb1_id, sapb1_settings (json), soft-delete}`.
Branches can be grouped (e.g., all Riyadh branches under one group) mainly for **SAP warehouse
mapping** and reporting roll-ups. We have no equivalent — every branch stands alone.

### 1.3 Fulfillment status: transaction-level, not line-level

Their `branches_report_data()` query reads `transactions.shipping_status` — **this is a field on
the transaction (invoice) itself**, not on each line item. Contrast with our design: we track
`fulfillmentStatus` per **SaleItem** (line), which is actually *more granular* than theirs. This is
a case where **we already do more than the reference** — worth knowing so we don't "fix" this
thinking it's a gap.

They also track `unwashable` as a boolean flag directly on the sell line at time of sale (not as a
return reason after the fact) — i.e. staff can mark an item unwashable *during* processing, separate
from our sell-return flow. Different lifecycle point for essentially the same concept.

### 1.4 Location access control — architecture difference, not a gap

Reference implements per-branch access as **dynamic permissions**: each branch gets an
auto-generated permission `location.{id}`, and a user "has" a branch if they hold that permission,
or the blanket `access_all_locations` permission. Locations live in the *same permission table* as
feature permissions (`products.view`, etc.) — there's no separate assignment table.

We use a simple `UserBusinessLocation` join table + `isSystemAdmin` bypass. **Functionally
equivalent outcome** (a user has a set of allowed location IDs, or "all"), just a different
implementation. Not a gap — a legitimate architecture choice we already made consciously.

### 1.5 Per-branch Settings screen (`LocationSettingsController`)

The reference has a dedicated settings page per branch (`/business-location/{id}/settings`) covering:
- Receipt printing (print-on-invoice toggle, printer type, specific printer)
- Invoice layout + invoice numbering scheme + return layout + return-POS layout selection
- SAP B1 cost-center "dimension" mapping (only shown if SAPB1 module installed)

**We only built a minimal VAT/CR number entry per business location.** This is a real, sizeable gap
if per-branch print/invoice customization matters to the business.

### 1.6 Cash Register — real design difference

Schema: `{id, business_id, location_id, user_id, status(open/close), closed_at, closing_amount,
total_card_slips, total_cheques, denominations(json), closing_note, machine_id, internal_id}`.

**Two things we don't do:**
1. **No `opening_amount` column exists on the table at all.** The opening float is recorded as a
   `cash_register_transactions` row (`type=credit, transaction_type=initial`) — i.e. their register
   reconciliation is built from a **full transaction ledger** (every cash movement — sales, payments,
   initial float — as individual rows), not a single "expected vs counted" summary. We store only
   final numbers (`openingCashAmount`, `expectedCashAmount`, `countedCashAmount`,
   `cashDifference`) on `RegisterSession` directly — **no per-movement ledger**, so we can't drill
   into "what made up the expected total" the way they can.
2. **`denominations` (JSON)** — actual bill/coin-count breakdown at close, not just a total. We only
   capture the total counted amount.
3. A register is tied to `user_id` **and** `location_id` both — same as ours conceptually, but a
   user can only have one open register full stop (`getCashRegisterAttribute` looks up by `user_id`
   only, no location filter) — worth confirming our own open/close logic enforces the same
   one-register-per-user rule (need to check).
4. `machine_id` — each physical POS terminal is its own tracked "Machine" entity (via their
   "Connector" module, out of scope) that a register session gets attached to. We have no concept of
   distinct physical terminals.

---

## 2. Messages — real gap found: no read-tracking

Confirmed via `User::getUnreadMessagesAttribute()` / `getMessagesAttribute()`:

- Messages are visible to a user if they hold permission on the `location_to` (destination) branch —
  **not** based on the user's "current" branch selection. Matches our permission-based visibility in
  spirit (we filter by `allowedLocationIds`), but worth double-checking our exact filter matches
  (from OR to in allowed set — we already do this, confirmed correct in P4-4 testing).
- **Per-user read tracking via a `user_messages` pivot table** (`belongsToMany` with timestamps).
  Unread count = messages addressed to a branch the user can access, that this specific user hasn't
  opened yet. **We built no read/unread state at all** — every message is just always "unread"
  forever, no way to mark seen, no unread badge count. This is a real, concrete gap if the dashboard
  message-badge behavior matters (the reference dashboard shows "You have N new messages").

---

## 3. Announcements — real gap found: multi-location targeting

- `announcements.locations_id` is a **comma-separated string of multiple location IDs**, not a
  single nullable FK. Empty string = all locations. We built a single optional `businessLocationId`
  (null = all, or exactly one branch) — **we cannot target "these 3 specific branches"**, only "all"
  or "exactly one." Real gap if multi-branch targeting is actually used.
- Visibility is filtered twice: (1) published + within `date_from`/`date_to` (we do this, and we
  already fixed an equivalent day-boundary bug), AND (2) **intersected against the current user's
  full permitted-location set**, not just whatever branch is currently selected in the location
  switcher. We only filter by `currentLocationId` (the UI's selected branch) — a user with access to
  multiple branches but a different one currently selected would miss an announcement scoped to a
  branch they *do* have access to. Real gap.

---

## 4. SAP Business One Integration — overview (not yet built, substantial scope)

Lives entirely in `Modules/SAPB1/` — a self-contained Laravel module (2,643-line main controller
alone) using a bundled `php-sapb1` client library that talks to **SAP's Service Layer REST API**
(the standard modern SAP B1 integration surface — OData-like query/filter syntax, seen in
`Lib/php-sapb1/SAPb1/{Query,Filters,Request,Response,SAPClient}.php`).

### 4.1 Connection settings (org-wide, not per-branch)

Stored as JSON on the `Business` (= our Organization) record, `sapb1_api_settings`:
```
sapb1_host, sapb1_port, sapb1_username, sapb1_password, sapb1_company (SAP company DB name),
sapb1_integration_user_id, default_tax_class, product_tax_type (inc/exc),
default_selling_price_group, start_date (sync-from cutoff),
product_fields_for_create[], product_fields_for_update[]
```
Per-branch SAP mapping (`sapb1_id` on `business_locations`, `Sapb1_dimensions` for cost centers) is
layered on top of this single org-wide connection.

### 4.2 What it syncs (route list = the full sync surface)

**Master data (push/pull):** categories, brands, units, price lists, tax groups, business locations,
products, contacts (customers/suppliers), customer groups, cost-center "dimensions", sales persons,
employees, chart of accounts.

**Transactional data:** purchases, stock adjustments, sells (sales), stock transfers, payments,
journal entries, bank deposits, batches (lot/expiry tracking), opening-stock import.

**Operational tooling:** a stock-quantity monitor with **auto-adjustment** (reconciles our stock vs.
SAP's), a transactions monitor, full sync-log with per-batch and per-entry drill-down, and a
"resend payment" retry action for failed syncs.

### 4.3 Scope assessment

This is a full bidirectional ERP sync layer — genuinely one of the largest single pieces of
functionality in the whole reference system. **We have zero SAP integration today.** Building this
properly (Service Layer auth, entity mapping for ~15 data types, sync-log/retry UI, stock
reconciliation) is a substantial standalone project, not a quick add-on. Flagging for prioritization
— not attempting a build without explicit direction on how deep to go.

---

## 5. Auth / Users / Roles / Business Settings

### 5.1 User model — field-by-field

Reconstructed from `create_users_table` + 8 additive migrations through 2025, and `App\User.php`.

| Field / concept | Reference | Do we have it? |
|---|---|---|
| Name | `surname` (fixed 10-char honorific), `first_name`, `last_name` — concatenated everywhere via `CONCAT(surname,' ',first_name,' ',last_name)` | ⚠️ we have `fullNameEn` + `fullNameAr` (single bilingual pair) — simpler and arguably better, but no honorific/surname split |
| `username`, `email`, `password` | ✅ `username`, `email`, `passwordHash` |
| `allow_login` (boolean) + nullable `username`/`password` | A user can exist as a **non-login staff record** (e.g. a commission agent or factory worker who's tracked in the system but never logs in) — `username`/`password` are simply left null | ❌ not built — every `User` row in our schema requires `username`, `email`, `passwordHash` (all non-null, `username`/`email` unique). We have no way to represent a staff member who isn't a login account. |
| `status` enum | `active` / `inactive` / **`terminated`** (3 states) | ⚠️ we only have `ACTIVE` / `INACTIVE` (2 states) — no distinct "terminated" (permanently gone, vs. temporarily inactive) |
| Soft delete | `SoftDeletes` trait, `deleted_at` | ✅ `deletedAt` |
| `max_sales_discount_percent` | per-user cap on the discount a cashier can apply at POS | ❌ not tracked — **real gap** if per-cashier discount ceilings matter (we only have role-level `sales.*` permissions, no numeric ceiling) |
| `is_cmmsn_agnt` + `cmmsn_percent` + `commission_id` (→ `Commission` model) | a user can double as a **sales commission agent** with a % rate or a named commission plan | ❌ not modeled — see §16 (Expenses/Commission Agents) |
| `selected_contacts` + `cg_ids` (json) + `access_type` | restricts a user to only see/act on **specific customers or customer groups** | ❌ not built — any user with `customers.view` sees all customers in their accessible locations |
| `dob`, `gender`, `marital_status`, `blood_group`, personal-address fields | HR-ish personal fields | ❌ not tracked (presumably deliberate exclusion for a POS) |
| `contact_number`, `alt_number`, social links | ⚠️ we have a single `phone`, nothing else |
| `custom_field_1..4` | free-form per-business custom fields on a user | ❌ not built |
| `id_proof_name`, `id_proof_number` | e.g. Iqama/national ID | ❌ not tracked — could matter for Saudi labor-law recordkeeping |
| `stock_transfer_from_locations` (json) | restricts which locations a user is allowed to **transfer stock from**, independent of general location access | ❌ not built |
| `sapb1_id`, `sapb1_employee_id`, `machine_id` | SAP/terminal linkage | ❌ SAP field, out of scope (see §4); no distinct "terminal" entity on our side either (§1.6) |
| — | our `isSystemAdmin` (org-wide bypass of location scoping) | ✅ we have this; reference's closest analog is the blanket `access_all_locations` permission — roughly equivalent outcome |
| — | our `lastLoginAt`, `createdBy`/`updatedBy`, `LoginAttempt` table (every login attempt logged) | ✅ **we track more here than the reference does** — no `last_login_at`, audit columns, or brute-force/lockout table found on reference's `users` table |

**Real gaps worth flagging:** non-login staff records (`allow_login=false`), per-cashier max discount ceiling, sales-commission-agent modeling on the user, customer/customer-group access restriction per user, per-user stock-transfer-location restriction, national-ID field, 3-state status (`terminated` distinct from `inactive`).

**Architecture differences, not gaps:** system-row separation (`PlatformAdmin` is a fully separate table, not mixed into `User`), per-user locale (handled client-side via i18next, not a DB column), `isSystemAdmin` flag vs. `access_all_locations` permission — functionally equivalent outcomes via different means.

### 5.2 Role / permission system

Confirmed via `RoleController.php`/`ManageUserController.php`, correcting/extending the `location.{id}` finding already in §1.4:

- **Role namespacing, not tenant FK isolation.** A role's DB `name` is `"{RoleName}#{business_id}"` in one shared Spatie `roles` table across all tenants (the suffix is stripped for display). We instead scope `Role` with a real `organizationId` FK + `@@unique([organizationId, nameEn])` — **same outcome, cleaner mechanism. Not a gap.**
- **`is_default`** protects seeded roles (`Admin`, `Cashier`) from delete/rename, with a one-time carve-out letting `Cashier` be edited once before losing its default flag. Our `Role.isSystem` is coarser (blocks delete outright, no "one edit then it's normal" nuance) — minor, low value to replicate.
- **Dynamic per-object permissions extend beyond locations**: `spg_permissions` apply the same `location.{id}`-style pattern to `SellingPriceGroup` rows (per-price-list role restriction). We only have a flat `price-lists.manage` permission — real gap only if per-price-list role restriction is actually needed.
- **`is_service_staff`** — a boolean directly on `Role`, separate from permissions, likely gating whether the role's users appear in "who processed this item" pickers. No equivalent on our `Role`.
- **A user holds exactly one role** on both sides — confirmed match.
- **No role CRUD exists on our side at all.** `roles.create/update/delete` permission codes are defined in `backend/src/config/permissions.ts` but `role.controller.ts` implements only `list`; there is no create/update/delete endpoint or editor UI. Every organization is stuck with the fixed 13-role catalog from `backend/src/config/defaultRoles.ts`. **This is the highest-value fix in this section** if custom roles matter to any customer.
- `UserGroup`/`UserGroupPermission`/`UserUserGroup` exist in `schema.prisma` but are completely unwired (no controller/service/route ever queries them) — dead schema, not a reference-parity gap, just worth cleaning up or finishing.

### 5.3 Business / Organization-level settings

**The starkest gap in this section.** Reference's `business` table carries a large org-wide settings blob (editable via one settings screen) spanning: bilingual identity, currency/tax config (incl. dual tax-registration numbers), fiscal year start month, date/time/currency formatting precision, accounting method, ~12 inventory feature toggles (lot numbers, racks, expiry), POS behavior JSON blobs, a full reward-points program parameter set (rate, min/max redeem, expiry), email/SMS sending config, branding (logo, theme color, custom labels), numbering prefixes per document type, and enabled-modules toggles.

**Our `Organization` model has none of this** — just `id, nameEn, nameAr, slug, status, trialEndsAt`. There is no settings GET/PATCH endpoint and no settings page in the frontend at all. `currency`/`timezone` live per-branch on `BusinessLocation` instead of org-wide (an inversion of the reference's default, not obviously better or worse — **architecture difference**). Some reference fields are legitimately irrelevant to a single-currency domestic laundry business (multi-currency, FIFO/LIFO/AVCO costing); others are plausibly wanted (fiscal year start for reporting, email/SMS sending config, custom invoice numbering prefixes, reward-point program parameters).

### Real gaps worth flagging (§5)
- No role CRUD — fixed 13-role catalog, no way to create/customize a role despite the permission codes already existing.
- No organization/business settings screen or API at all.
- No non-login staff records — every `User` needs real login credentials.
- No per-user customer-access restriction, no per-cashier discount ceiling, no sales-commission-agent modeling on users, no per-user stock-transfer-location restriction.

---

## 6. Contacts — Customers & Suppliers

### 6.0 Architecture: unified `Contact` vs. our split `Customer`/`Supplier`

Reference unifies customers and suppliers into one `contacts` table with a `type` enum (`customer`/`supplier`/`both`/`lead`) — one row can be simultaneously a customer and a supplier (e.g. a hotel that sends laundry AND supplies detergent), sharing one address book entry, one balance-adjacent record, and one statement view. We have entirely separate `Customer`/`Supplier` models with no shared identity.

**Real gap only for the both-at-once scenario** — if the business has real customer+supplier overlap, that party must be entered twice today with no linkage. If it's purely walk-in customers and unrelated third-party suppliers, this is a difference without a consequence. Recommend confirming with the business before investing in a merge.

### 6.1 Customer-relevant fields

| Field | Reference | Ours (`Customer`) |
|---|---|---|
| Bilingual name | `name` only, no Arabic split on Contact | ✅ we're ahead: `nameEn`/`nameAr` |
| Phone duplicate check | Required, min-length validated, **checked for duplicates including soft-deleted rows** | ❌ **real gap** — no duplicate-phone check at all; the same number can be entered on multiple customer records, breaking phone-based lookup at POS |
| Contact type | `contact_type`: individual/business | ❌ not tracked |
| National address | `building_no`, `additional_no`, `map_location`, `latitude`/`longitude` — full ZATCA national-address + GPS, dedicated map view | ⚠️ single free-text `nationalAddress`, no structured breakdown, no map — same class of gap already flagged for Business Locations in §1.1 |
| Credit limit | `credit_limit` (null = unlimited) | ✅ `creditLimit` (defaults to 0 — confirm enforcement treats "0" vs "unlimited" consistently) |
| Payment terms | `pay_term_number`+`pay_term_type` (days/months) + separate `PaymentTerm` master table | ✅ `paymentTermsDays` (days-only, simpler) |
| Opening balance | Written as an `opening_balance`-type Transaction row, reconciled against payments | ❌ **real gap: `Customer` has no `openingBalance` input at all** — contrast with `Supplier`, which correctly has both `openingBalance` and `balance`. A new customer can't be onboarded with a carried-over due balance. Looks like an oversight given Supplier already does this right. |
| Customer group / price list | `customer_group_id`, `selling_price_id` | ✅ `customerGroupId`, `priceListId` — our schema even documents the override precedence more explicitly than the reference does |
| Approval/verification workflow | Multi-step approve gate (`approve` int + business-level `customer_multi_approve` toggle) before a new customer is usable | ❌ **real gap** — every customer is immediately usable; worth it only if the business wants "new customer must be approved" for large corporate accounts |
| Custom fields | 10× generic `custom_field1..10` | ❌ not built |
| Contact tags/properties | Free-form `ContactProperty` tagging | ❌ not built |
| Default/walk-in customer | `is_default` flag | ✅ equivalent — we seed a `WALKIN` customer + group per org, referenced in ZATCA XML buyer-name fallback |
| Cashback | `cash_back` field **directly on Contact**, backed by a ledger | ⚠️ flagging for the separate loyalty audit — cashback lives on Contact itself in the reference, not purely a side table |

### 6.2 Supplier-relevant fields

Suppliers share the same table/fields as customers in the reference (no separate supplier schema). Comparing against our `Supplier` model:

- ✅ Bilingual name — ahead of reference again.
- ❌ **No `creditLimit` field on our `Supplier` model at all** — only `Customer` has one. If purchase-on-account exposure per supplier needs capping, it currently can't be.
- ✅ Opening balance handled correctly (`openingBalance` + `balance` both seeded on create) — this is the one place we're *more* complete than the customer side (see the customer opening-balance gap above).
- ✅ Payment terms present.
- Everything else (address structure, custom fields, approval flow) has the same gaps as §6.1.

### 6.3 Customer self-service / portal

Confirmed present in the reference (`Modules/Connector`) — mobile-OTP login, register, forgot/reset-password, plus a `CustomerMessages` table linking automated SMS triggers (e.g. "order ready") to specific invoices. **We have no equivalent, confirmed via repo search.** Reads as a distinct customer-facing mobile-app product surface (added Feb 2025 in the reference) rather than part of the admin POS/ERP core — treating as a **deliberate, documented exclusion** rather than an unnoticed gap, unless pickup/delivery order-status texting to customers is ever on the roadmap (the "order ready" SMS pattern is specifically the kind of feature a laundry business benefits from).

### 6.4 Customer Groups

| Field | Reference | Ours (`CustomerGroup`) |
|---|---|---|
| Discount mode | `amount` + `price_calculation_type` — supports **both %  and flat-amount** | ❌ percentage-only — real gap if flat "SAR 10 off" group pricing is ever wanted |
| Spend/volume caps | `max_qty`/`max_inv`/`max_amount` per group, individually overridable per-contact | ❌ **real gap** — no spend/volume cap mechanism at all; plausible real need for corporate/hotel accounts with monthly credit ceilings |
| Corporate flag | `is_corporate` (drives invoice-format selection) | ❌ not tracked — ties into the per-branch invoice-layout gap (§1.1/§1.5) |
| Price editable at POS | `price_editable` toggle per group | ❌ not built |
| Credit limit | `credit_limit_customer` | ✅ `creditLimit` on `CustomerGroup` (unclear if it combines/overrides with the customer's own — not confirmed) |

### Real gaps worth flagging (§6)
- Customer `openingBalance` missing entirely (Supplier has it correctly).
- No duplicate-phone check on customer/supplier creation.
- No `creditLimit` on `Supplier`.
- No customer-group spend/volume caps.
- No customer approval/verification workflow.
- Group discount is percentage-only, no flat-amount mode.
- Contact-level national address is flatter than the reference (same class of gap as Business Locations, §1.1).

**Architecture difference, not a gap:** unified `Contact` vs. split `Customer`/`Supplier` — only matters for the both-at-once scenario (§6.0).

---

## 7. Products / Categories / Brands / Units / Tax Rates / Services

### 7.1 Products

Key architectural fact: in the reference, price/stock never live on the `products` row — every product (even single-type) gets an auto-created `Variation` row holding price and per-location stock. The variant-matrix machinery itself (`ProductVariation`, `VariationLocationDetails`, templates) is confirmed irrelevant to laundry and correctly not built on our side.

| Field | Reference | Ours (`Product`) |
|---|---|---|
| SKU auto-generation | Auto-generated if left blank | ⚠️ `sku` required in our schema, no auto-generation fallback |
| Barcode | Barcode value overloads SKU | ✅ we're ahead — distinct `barcode` field + `barcodeType`, separately unique |
| `not_for_selling` | Tracked-but-unsellable flag (e.g. kit component) | ❌ not built |
| `price_editable` (per-product, intersects with `CustomerGroup.price_editable`) | Lets cashier override sell price at POS for specific items/tiers | ❌ **real gap** — `pos.service.ts` always resolves price server-side, no override path exists anywhere |
| `hidden_item` | Hide from POS grid without deactivating | ❌ not built — only binary ACTIVE/INACTIVE |
| `free_item`/`max_free_qty` | Give-away-free promotions linkage | ❌ not built — belongs with Promotions/Coupons (§13) |
| Custom fields | 4× generic fields | ❌ not built |
| Product↔customer-group visibility | M:N pivot restricting product visibility to specific groups | ❌ not built |
| Description | Single `product_description` | ⚠️ we're ahead — bilingual `descriptionEn`/`descriptionAr` |

### 7.2 Services ("Types of Service") — important correction

**The reference's `TypesOfService` is NOT a wash/dry-clean/iron processing-type concept** — it's an **order-level channel selector** (`types_of_service_id` on the transaction) that auto-swaps the whole order's price list per branch and adds a flat/percent packing charge, plus unlocks custom fields. Plausible real use: "Walk-in" vs. "Home Delivery" vs. "Corporate", each with its own pricing tier and packing fee. **We have no equivalent order-level channel/packing-charge construct at all** — real gap if tiered order channels matter.

The actual wash/dry-clean/iron catalog in the reference is just regular `Product` rows grouped by `Category` — **the reference has no dedicated service model**. We built a first-class `Service` model instead, which is a legitimate, arguably cleaner architecture choice for a laundry-only business — **not a gap**.

**Turnaround time — real, consequential gap:** reference tracks `Category.due_days` ("Default Washing Days") and actually **uses it** — the POS line-item template reads it live and auto-populates the sale's due date as items are added to cart. We have `Service.estimatedProcessingHours` (finer-grained, per-service not per-category — a better data model) but **it's a dead field**: nothing in `pos.service.ts`, `sale.service.ts`, or the `Sale`/`SaleItem` schema ever reads it. No `dueDate`/`promisedAt`/`readyBy` field exists anywhere on `Sale`. **We capture more granular data than the reference but never act on it** — no promised completion date is ever calculated, stored, or shown to staff or customers.

Express/rush pricing: confirmed **not a reference concept either** (searched both codebases) — not a gap, this tier doesn't exist to match.

### 7.3 Categories, Brands, Units, Tax Rates

- **Categories**: reference has no `name_ar` at all (we're ahead, bilingual). Real gaps: `due_days` (see above), `hidden_pos` (hide from POS tiles without deactivating), `allow_booking` (ties to Bookings module).
- **Brands/Units**: mostly parity; reference has no bilingual names (we're ahead). Real gap: `Unit.allow_decimal` (whether fractional quantities are permitted) — nothing stops entering `2.5` pieces today.
- **Tax Rates**: reference supports **compound Tax Groups** (`is_tax_group` + `group_sub_taxes` — e.g. combined "VAT + Municipal Tax" line, each component itemized on the invoice). Our `Tax` model is flat, one `percentage` per row. Low urgency under Saudi's flat 15% VAT, but a real structural gap if compound tax ever applies. We're ahead on `TaxCategoryCode` (ZATCA UBL classification) — no reference equivalent since it predates ZATCA e-invoicing.

### 7.4 Barcode / label printing — confirmed absent

Reference has a full label-sheet layout template system (`Barcode` model: sticker size, paper size, margins, rows/cols per sheet, continuous-roll vs. sheet). **We have nothing here, confirmed via repo search.** Worth flagging explicitly if garment/product tagging at intake needs a printed barcode ticket — though this may be intentionally superseded by the existing item-level `fulfillmentStatus` tracking via a different mechanism; confirm before treating as a priority gap.

### Real gaps worth flagging (§7)
- No cashier price-override mechanism (`price_editable`) anywhere in checkout.
- `Service.estimatedProcessingHours` captured but never used — no due/ready date is ever computed or shown, despite the reference doing this (more coarsely) successfully.
- No order-level "Type of Service" channel selector (packing charge + per-branch price-list switch).
- No compound Tax Groups.
- No barcode label-printing system.
- Minor: `not_for_selling`, `hidden_item`, `Unit.allow_decimal`, `Category.hidden_pos`, SKU auto-gen fallback, product↔customer-group visibility.

**Architecture difference, not a gap:** dedicated `Service` model vs. reference reusing generic Product/Variation for everything.

**Genuinely irrelevant, correctly not built:** full variant-matrix machinery, serial/batch/expiry tracking, `free_item` promotions linkage (belongs in §13 instead).

---

## 8. POS / Sells — Checkout Transaction Engine

### 8.1 Transaction & line-item field comparison

| Field | Reference | Do we have it? |
|---|---|---|
| Staff-only note | `staff_note`, separate from customer-facing `additional_notes` | ❌ single `Sale.notes` field only |
| Payment due date / credit terms | `pay_term_number`/`pay_term_type` → derived `due_date`, `overdue`/`partial-overdue` status escalation | ❌ **real gap** — `PaymentStatus` tracks that money is due, never by when |
| Rounding | `round_off_amount` | ❌ not tracked — we always store exact decimals |
| COGS/cost-lot linkage | `TransactionSellLinesPurchaseLines` ties each sell line to the specific purchase-line lot(s) and cost it drew from | ❌ **real gap** — `InventoryTransaction` tracks quantity movement only, not cost basis; true per-sale COGS isn't computable |
| Rewash tracking | `rewash` boolean + rollup attributes — garment sent back through the wash cycle as a distinct in-process event (not a return, not a compensation) | ❌ **real gap** — no equivalent state in our fulfillment-status model |
| Carpet/rug sizing | `width`/`height` on sell lines | ❌ not tracked — plausibly relevant given §1.1's signal that carpet is a distinct revenue line for this client |
| Packing charge / service channel | `packing_charge` + `types_of_service_id` on the transaction | ❌ same gap as §7.2 |
| Line-level note | `sell_line_note` | ❌ we only have an invoice-level note |

### 8.2 Payment record comparison

| Field | Reference | Ours (`Payment`) |
|---|---|---|
| Card/cheque detail | Dedicated columns: `card_number`, `card_type`, `card_holder_name`, expiry, `cheque_number`, `bank_account_number` | ❌ folded into one generic `referenceNumber` string |
| Unconfirmed/pending-clearance state | `payment_confirmed` bool — a cheque/bank-transfer payment can be recorded but excluded from "money in hand" until manually verified | ❌ **real gap** — every `Payment` we record is immediately treated as settled |
| Payment splitting/reversal | `parent_id` + child payments | ❌ not built |
| Advance payments (deposits not yet tied to a sale) | `is_advance` + `payment_for` | ❌ not built — could matter for laundry deposits taken before service |

### 8.3 Sales Order / Quote pipeline — most consequential finding in this section

Reference supports a real, ID-addressable, server-priced pre-sale pipeline: a `sell`-type transaction can sit in `draft`/`quotation`/`proforma` status (same `transactions` table, same invoice-number sequence, stock untouched until `final`), **plus** a fully separate, heavier `sales_order` type with its own status lifecycle enabling **partial fulfillment** against a standing order over multiple visits. Explicit conversion endpoints (`convertToInvoice`/`convertToSaleOrder`/`convertToProforma`) move a document between these states in place.

Our only "pre-sale" construct is `HeldSale`/`HeldSaleItem`, which is architecturally a **different kind of thing**: separate tables (no invoice number at all), client-supplied pricing not recomputed against current price lists, and no back-reference from the eventual `Sale` to the `HeldSale` it came from. `SaleStatus.DRAFT` exists in our enum but `checkout()` never writes it — every checkout is unconditionally `FINAL`.

**Real gap for the "drop off, get a quote, come back later to confirm" laundry workflow** — the reference has a purpose-built, auditable, durable quote-to-order-to-invoice pipeline; we have an ephemeral same-shift cart-park with no invoice identity or price integrity guarantee.

### 8.4 Back-office-sell vs. POS-terminal split

Confirmed the reference's "back-office" `SellController@store` is an **empty stub** — both screens funnel into the same `SellPosController@store`. The real difference is a richer, permission-gated *creation screen* (`/sells/create`, gated by `direct_sell.access`/`quotation.create`/`draft.create`/`so.create`), not a second transaction engine.

**Our system has exactly one write path for creating a `Sale`: `POST /pos/checkout`.** There is no way to record a sale that didn't go through the live POS screen (e.g. a phone order entered after the fact, or a backdated sale — `checkout()` always stamps `new Date()`). Worth confirming this is acceptable rather than an oversight.

### Real gaps worth flagging (§8)
- No sales order / durable quote pipeline (§8.3) — the single most consequential finding for the "quote, confirm later" laundry workflow.
- No payment due date / credit-terms escalation.
- No internal staff-only note distinct from the customer-facing note.
- No payment method-specific reference fields (card/cheque detail).
- No unconfirmed/pending-clearance payment state.
- No rewash tracking.
- No COGS/cost-lot linkage on sell lines.
- No width/height or packing-charge/service-channel fields.

**Architecture differences, not gaps:** back-office vs. POS split (one real engine either way); `HeldSale` as a separate table vs. a flagged transaction row (only matters if a held sale needs to be referenced by invoice number before finalization).

**Not a gap:** exchange rate/multi-currency/export flag (SAR-only by design); modifier/combo line nesting, restaurant fields, SAP-linked batch tracking (out of scope).

---

## 9. Purchases / Purchase Orders / Purchase Returns

### 9.1 Purchase transaction — status lifecycle and header fields

The reference splits `pending`/`ordered`/`partial`/`received` across **two distinct transaction types**: a `purchase` with a **manually-selected** status (`received`/`pending`/`ordered`, no `partial`) that **locks permanently once `received`**; and a separate `purchase_order` with a **system-computed** status (`ordered`/`partial`/`completed`, derived from `SUM(quantity)` vs `SUM(po_quantity_purchased)`). Stock only moves when a `purchase` reaches `received`. A `purchase_order` isn't received directly — one or more `purchase` transactions can each apply against it (`purchase_order_ids` array, plural), incrementing its fill percentage over time, enabling partial receiving across multiple deliveries.

**Our `PurchaseStatus` enum is `RECEIVED`\|`CANCELLED` only, defaulting to `RECEIVED`** — every purchase is created already received, stock/cost applied immediately. **There is no `PurchaseOrder` model in our schema at all**, so no pre-receipt state and no partial-receiving-over-time tracking.

**Important tempering context**: our own schema comment (`schema.prisma`, above `model Supplier`) already records that the reference's live `/purchases` route 403s even for an admin login on this specific client's business — this business's actual configuration doesn't expose the PO screen in its nav, and cost tracking here is done at `Product.purchasePrice` rather than through purchasing. So while the PO status machine is real in the reference *codebase*, it's likely not part of what this business actually uses — worth confirming with the business owner before investing in a build.

Other header gaps: no purchase-level discount, no additional-expense lines (freight/handling), no document/invoice-scan upload, no expected-delivery-date (reference doesn't have this either — not a gap).

### 9.2 Purchase line comparison

Reference's `purchase_lines` tracks `quantity_sold`/`quantity_adjusted`/`quantity_returned`/`quantity_remaining` **per specific purchased lot** — a real FIFO/lot-consumption ledger answering "how much of *this* purchase is still on the shelf." **We have no equivalent** — only an aggregate `ProductStock.quantity` balance, compounding the already-logged §8.1 COGS/cost-lot-linkage gap. Also missing: `lot_number`/`mfg_date`/`exp_date` (plausibly relevant for detergent/chemical batch shelf-life, though reads more pharmacy-driven than laundry-driven), and sub-unit purchasing (buy a case, stock in units).

"Edit product's sell price while receiving a purchase" is a reference workflow we don't have — **architecture difference**, arguably safer to keep cost-capture and catalog-pricing decoupled.

### 9.3 Purchase Returns — Combined vs. regular controller split

`PurchaseReturnController` handles return-against-a-known-purchase: mutates `quantity_returned` directly on the original purchase's lines and **overwrites** the return in place (one return doc per purchase, editable, not additive). `CombinedPurchaseReturnController` handles a free-standing return with **no parent purchase at all** — picks products directly off current stock, useful when the originating purchase is unknown or a single return/credit spans stock from multiple historical purchases.

**We only implement the first half** — `PurchaseReturn` always requires a `purchaseId`. No equivalent of the Combined controller (returning/crediting stock without a known originating purchase). However, unlike the reference's overwrite-in-place behavior, **ours correctly accumulates** — each call creates a new additive return validated against remaining quantity, a more defensible audit trail than the reference's overwrite pattern. We also track a typed `PurchaseReturnReason` enum the reference has no equivalent of — **ahead here.**

### Real gaps worth flagging (§9)
- No `PurchaseOrder` document type / pre-receipt state / partial-receiving-over-time (tempered — may not be used by this business in practice).
- No lot-level consumption ledger on purchase lines.
- No purchase-header discount, freight/handling lines, or invoice-scan upload.
- No Combined-style return (return/credit without a known originating purchase).

**Architecture differences, not gaps:** overwrite-in-place vs. additive returns (ours is better); decoupled cost-capture vs. catalog-price editing.

**Irrelevant to laundry, correctly deprioritized:** `PurchaseLineBatch` (pure SAP plumbing), sub-unit/case purchasing, mfg/lot/expiry tracking (pharmacy-driven).

---

## 10. Sell Return / Credit Note

### 10.1 Verdict: Credit Note is a genuinely distinct transaction type, not just a receipt name

`credit_note` is its own `transactions.type`, with its own controller, permissions, and — critically — three behaviors a plain sell-return doesn't have:
1. **Can exist with no parent sale and no physical goods returned** — `Create_Credit_Note()` only loads a parent sale if a `transaction_id` is given; otherwise it's a pure financial credit (e.g. an "early settlement discount" reconciliation with a synthetic line, no real return item).
2. **Inventory impact is a separate flag** (`sub_type`) — `'quantity'` restocks like a normal return; `'balance'` never touches stock at all (pure financial credit).
3. **Has a draft/approval lifecycle** (`sub_status='draft'`, gated by `approve_draft_credit_notes`) that sell returns don't have at all.

### 10.2 The reconcile feature — the real crux

Both flows auto-net against their own parent sale at creation. **Credit Note alone** gets a second, later, manual reconciliation screen: pick from *any other unpaid sale for that customer* (not just its own parent) and apply the credit against it — or auto-apply oldest-due-first. This is a genuine running store-credit instrument ("issue a credit now, spend it against whatever invoice later"), not a single-transaction refund. Sell return has no equivalent — its leftover balance just sits as `due` on that one transaction.

### 10.3 What we have

`Customer.balance` can already go negative (a `SellReturn` where `refundedAmount < totalAmount` nets to store credit) — the data-model primitive exists. **What's missing is everything the reference does with that credit afterward**: nothing in `pos.service.ts` or `customers/` reads an existing negative balance and applies it to pay down a *different*, later sale. The ledger accrues but is never walked back down against arbitrary invoices.

### Real gaps worth flagging (§10)
- **No mechanism to apply an existing credit balance to a later, unrelated sale** — the single biggest gap in this section; the reconcile-against-any-invoice screen has no equivalent at all.
- No standalone/goods-free credit issuance (every credit-equivalent event requires a `saleId` + real `SaleItem` lines).
- No draft/approval workflow for returns or credits.
- No cancel/delete endpoint for a sell return at all (mis-entered returns can't be voided).

**Architecture difference, not a gap:** the reference's two-model split (`sell_return`/`credit_note` sharing one line table via a FK trick) exists largely for its separate permission/approval plumbing; our single `SellReturn` model already covers the core "return goods, get cash or credit" case cleanly — the gaps above are missing *capabilities*, not a missing second model. Reason-code taxonomy already matches the reference by design.

---

## 11. Stock Adjustments / Stock Transfers / Inventory Posting

### 11.1 Stock Adjustments

Reference has a real header document (one adjustment groups N product lines, auto ref-no), a `normal`/`abnormal` loss classification, a `total_amount_recovered` field for abnormal-loss cost recovery, and a delete/reversal endpoint. **We have none of these** — `adjustStock()` takes exactly one product per call with a free-text reason, no grouping, no loss classification, no recovery tracking, no reversal endpoint. No approval workflow exists on either side (not a gap — matches).

### 11.2 Stock Transfers — most consequential finding in this section

Reference models a transfer as **two linked transactions** with a real lifecycle: `pending → in_transit → completed`, stock untouched until the destination explicitly **receives** it, with a discrepancy flag if received quantity differs from committed quantity. Commit requires access to the source location; Receive requires access to the destination — two gated actors, two steps.

**Our transfer is atomic and instantaneous** — source decremented, destination incremented, in one call, with only a blanket `inventory.transfer` permission (not scoped to source vs. destination specifically). No in-transit visibility, no discrepancy detection, no note thread (single note vs. reference's running thread), no driver/vehicle fields, no document attachment, no waste sub-type, no delete/reversal. This is a legitimate simplification if transfers are always short same-day van-runs — becomes a real gap the moment the business needs to know "this stock left branch A but isn't confirmed received at branch B yet," which is plausible for a multi-branch Saudi laundry operation.

### 11.3 Inventory Posting

The core concept matches (branch-period snapshot of sale-invoice disposition + cash count), but the reference's version is manually-curated, drillable, and three-stage; ours is automatic, opaque, and two-stage:
- Reference lets staff **manually** triage each invoice into In Stock/Out Stock/In Warehouse with a real join table back to the source transactions (drillable). **Ours auto-buckets purely from `SaleItem.fulfillmentStatus`, with no override path and no linkage table** — a confirmed posting is an opaque aggregate number with no way to trace which orders it covers. **Real gap.**
- Reference has a third `reconcile` stage after `confirmed`; we stop at `CONFIRMED`.
- Reference tracks staff-on-duty (`employee_ids`) and a configurable date range; we hardcode a rolling 30-day/today-only window with no staff roster.
- No edit route for a still-pending posting on our side (reference allows re-triaging before confirming).

### 11.4 General audit trail — we're actually ahead

Reference's `StockActivityLog` looks like a broader audit table on paper, but tracing every call site shows the model hooks that would populate it are **entirely commented out** in the current reference codebase — it's dead/orphaned code, bypassed by the real stock mutations happening directly in controllers. **Our `InventoryTransaction`, written synchronously in the same DB transaction as every stock mutation (with `balanceAfter`, `note`, `createdBy`, linked `referenceId`), is more reliable and complete in practice than the reference's nominal equivalent.** Flagging explicitly so this isn't miscategorized as a gap later.

### Real gaps worth flagging (§11)
- Stock Adjustments: no loss classification, no cost-recovery field, no multi-line grouped document, no reversal.
- Stock Transfers: no in-transit status / two-step commit-receive workflow (most consequential), no discrepancy detection, no note thread, no driver/vehicle/document fields, no waste sub-type, no reversal, weaker location-scoped permission enforcement.
- Inventory Posting: no linkage back to source sales (opaque, not drillable), no manual override of auto-bucketing, no staff roster, stuck at 2 of 3 lifecycle stages, no edit-while-pending.

**Architecture difference, not a gap:** `StockActivityLog` (reference) is dead code — our `InventoryTransaction` is the more trustworthy audit trail despite looking narrower on paper.

---

## 12. Compensations / Reparation

### 12.1 Data model & 12.2 valuation

Reference allows **one claim to cover multiple products from the same sale**, each with its own quantity and reason (`product_damage`/`product_lost`) via a M:N pivot. **Ours is narrower**: a claim covers either the whole sale or exactly one line item, with one reason for the whole claim — no multi-item, per-item-reason claims. Reference also has a duplicate-claim guard (one claim per sale, redirects to the existing one) and a human-readable claim code (`#0004`) and evidence/document upload — **we have none of these three**.

Valuation is negotiated free-text on both sides (not a gap). We're actually **ahead** on valuation structure: we split `claimedAmount` (initial ask) from `approvedAmount` (what's granted) — the reference has one mutable `amount` reused for both, with no way to record "customer claimed 200, we approved 150."

### 12.3 Lifecycle — we're ahead here too

Reference's real state machine only has two persisted states (`pending`/`completed`) — a submitted "confirmed" status is auto-collapsed to `completed` immediately, and **there is no reject state at all**; an unwanted claim is just left pending forever or hard-deleted. **We have a genuine 3+1 state machine** (`PENDING`→`APPROVED`→`PAID`, plus `REJECTED`) — richer than the reference. Flagging so nobody "simplifies" ours to match theirs. Real gap on our side: **no delete endpoint at all** for a compensation (reference allows delete pre-completion).

### 12.4 Resolution "type" — the core behavioral gap

This is the single biggest functional difference in this section. The reference's `type` field (`cash`/`points`/`coupon`/`cash_back`/`no_thing`) determines what **actually happens** on confirmation: `cash` auto-posts an Expense transaction to a configured default expense category; `points` awards loyalty points; `coupon` auto-generates a single-use customer-scoped coupon; `cash_back` writes a cashback ledger entry; each (except `no_thing`) fires a templated customer SMS.

**Our `resolve()` does none of this** — marking a claim `PAID` only sets `approvedAmount`/`resolvedAt`/`resolvedBy` on the row; no money movement, no points award, no coupon issuance, no SMS. The primitives for points/coupon integration already exist elsewhere in our schema (`Coupon`, `LoyaltyTransaction`) but are never invoked from compensations — that half is a wiring gap, not a missing foundation. The cash/expense side has no primitive to hook into at all yet (no `Expense` model exists anywhere — see §16).

### 12.5 Approval workflow

Reference has 6 granular permissions including `compensations.changetype`, which specifically gates who can set the payout type/amount — a junior staffer can log that a claim exists without being able to authorize its payout. **We have one blanket `compensations.manage` permission** covering file + approve + pay indiscriminately — no segregation of duties. Reference also has `view_own` vs `view_all` scoping and a dedicated compensations report; we have neither.

### Real gaps worth flagging (§12)
- No resolution-type mechanism (auto cash/points/coupon/cashback + customer SMS) — the reference's core value-add here.
- No approve/pay segregation of duties (one permission does everything).
- No multi-item, per-item-reason claims.
- No evidence/document attachment, no delete endpoint, no compensations report, no duplicate-claim guard, no human-readable claim code.

**Architecture differences, not gaps:** our status lifecycle and claimed-vs-approved amount split are both *richer* than the reference's, not poorer — don't regress these. No per-sale uniqueness constraint is a genuine difference but plausibly a legitimate choice (supports multiple distinct incidents per invoice) rather than a defect.

---

## Modules reviewed so far
- [x] Business Locations (schema, grouping, settings screen, cash register tie-in)
- [x] Messages
- [x] Announcements
- [x] SAP B1 (overview level — not method-by-method)
- [x] Auth / Users / Roles / Business Settings (§5)
- [x] Contacts — Customers & Suppliers (§6)
- [x] Products / Categories / Brands / Units / Tax Rates / Services (§7)
- [x] POS / Sells checkout transaction engine (§8)
- [x] Purchases / Purchase Orders / Purchase Returns (§9)
- [x] Sell Return / Credit Note (§10)
- [x] Stock Adjustments / Stock Transfers / Inventory Posting (§11)
- [x] Compensations / Reparation (§12)

## 13. Payments / Accounts / Accounting Reports

### 13.1 Chart of Accounts — real double-entry ledger vs. nothing at all

Reference has a genuine double-entry Chart of Accounts: `Account` (self-organized under `AccountType` in a 2-level hierarchy businesses define themselves) fed by `AccountTransaction` (credit/debit rows). Every money-moving transaction type — sell, purchase, expense, purchase return, sell return, credit note, payroll — posts here automatically via an event listener (`TransactionPaymentAdded` → `AddAccountTransaction`), keyed off a fixed type→direction map. An unconfirmed payment (cross-ref §8.2) is invisible to account balances by default, not just to the payment record. The whole module is **opt-in per business** — some reference clients run with no ledger at all.

**We have no double-entry concept anywhere in our schema** — confirmed via grep, no `Account`/`ChartOfAccount`/`Ledger` model exists. `PaymentMethod` is a flat label with no type (cash/bank) and no account linkage; `Payment` creation never fires any ledger side-effect.

### 13.2 Per-branch account routing & 13.3 Bank Deposits

Confirms and extends §1.1's `default_payment_accounts` finding — routing precedence is per-user override → per-branch default → client-supplied account, invoked at both save-time and live in the UI. Moot on our side without an `Account` model to route into.

**Bank Deposits** — a real till-to-bank reconciliation workflow with an approval chain: a manager batches previously-recorded cash/cheque receipts, books them as deposited, and a separate approval step (distinct from the recorder) is required before it counts. This is the mechanism that reconciles §1.6's register cash-count against what actually reached the bank. **We have no equivalent** — `RegisterSession.cashDifference` is a terminal number with nothing downstream; no deposit record, no approval step, no traceability from "cash counted at close" to "cash that hit the bank."

### 13.4 Accounting-shaped reports

Reference's "balance sheet" and "trial balance" are, on inspection, the **same one-query account-balance listing reused twice** — not formally audited financial statements. Our `accountingReport` (revenue/discount/VAT/AR summary) is a solid VAT-filing sanity check but has zero expense, COGS, or cash-movement dimension (no `Expense` model exists — §12.4) — it answers "how much did we sell and who owes us," not "what is our financial position."

### Real gaps worth flagging (§13) — with severity assessment

- No Chart of Accounts / ledger of any kind — the foundational gap everything else here depends on.
- No till-to-bank deposit workflow or payment-voucher approval chain.
- No balance sheet / trial balance / account-linkage report.

**Honest severity call**: this is the single biggest "big lift, uncertain value" item in the whole audit. A real double-entry ledger is a different category of system — bookkeeping software bolted onto a POS, not a laundry-domain feature. Even the reference treats it as opt-in and its own "trial balance" is an approximation, not a real one. For a Saudi laundry business, the accounting question an owner actually asks day-to-day ("how much cash/card/bank did we take in, how much is owed to us, how much did we spend") is mostly answerable from `Sale`+`Payment`+`Customer.balance` (already covered) plus the still-missing `Expense` model for the spend side — recommend treating a full double-entry GL as **explicitly out of scope** unless this system is meant to fully replace the business's external bookkeeper. That's a business-strategy question worth confirming directly with the owner before scoping any work here.

---

## 14. Reports Triage

Our entire reports surface is **3 endpoints** (sales, inventory, accounting — one aggregate query each, no drill-down, no export). The reference has **~69 report methods**. Full inventory triaged by relevance; out-of-scope items (restaurant tables, bundled marketing/CRM analytics addon, expiry/lot reports, SAP/EJADA-specific) omitted here — see full triage in the audit source if needed.

### Real gaps worth flagging (§14) — prioritized for a laundry business owner

1. **No sales-by-product/service breakdown at all** — an owner cannot see "how much did wash-and-fold vs. dry-cleaning bring in this month" or view top-selling services; `salesReport` never touches `SaleItem`.
2. **No customer/supplier AR-AP balance & aging report** — can sort customers by `balance`, but no report listing who owes what, for how long (30/60/90-day aging), and no supplier-side payables view at all.
3. **No staff productivity report** — no way to see which staff member processed which orders or sales-per-cashier, despite the schema hook (`Role.is_service_staff`, §5.2) already existing unused.
4. **No VAT/tax breakdown report** — `taxAmount` is only ever a lump sum inside other reports; no by-rate or by-period VAT view, which matters for a ZATCA-compliant business filing returns.
5. **No stock-movement/adjustment history report** — the underlying `InventoryTransaction` ledger is solid (§11.4) but nothing surfaces it as a report.

Secondary: no register/cash-session history report (data exists, no list view), no branch-to-branch comparison, no best-sellers view, no consolidated cross-customer payments-received report.

---

## 15. Promotions / Coupons / Discount

### 15.1 Three distinct reference concepts

- **Discount** — fully automatic, no action at all: a live markdown baked into the displayed selling price itself, scoped to a brand/category/branch with a priority for conflict resolution. No code, no basket condition.
- **Promotion** — a scheduled campaign, either auto-applied or cashier-selected at POS, with 7 mechanics: flat discount, quantity-tiered discount, basket-amount-tiered discount, buy-X-get-Y-free gifts, a per-product buy-X-get-Y table (`PromotionProduct`), and cash-back-with-expiry. This is what `Product.free_item`/`max_free_qty` (flagged as orphaned in §7.1) actually feeds — they're a global ceiling on promotion-driven free-gift giveaways, meaningless without a Promotion engine.
- **Coupon** — the only one requiring a human-typed code; otherwise shares the same targeting shape as Promotion (product/category/brand/branch/customer-group).

### 15.2 Our Coupon vs. reference Coupon

Our validation logic (min-purchase, date-window, max-uses, percent/fixed capped at subtotal) is a faithful subset of the reference's — but real gaps exist: **no `max_discount` cap** on percentage coupons (margin-protection risk on large baskets), **no per-customer redemption limit** (only a global cap — a leaked code can be reused unlimited times by one customer), **no product/category/branch/customer targeting at all** (ours always discounts the whole cart org-wide), and no day-of-week/time-of-day windows (date range only). Minor gaps: no separate coupon name vs. code, no bulk-generate, no CSV import, no provenance tracking.

### 15.3 No Promotion or Discount equivalent at all

Confirmed via exhaustive schema search — no `Promotion`, `PromotionProduct`, or `Discount` model exists. Nothing fires automatically at checkout on quantity/basket conditions, no free-gift mechanic, no live catalog markdown. `PriceList` is the closest adjacent concept but serves a different purpose entirely (negotiated per-customer/group flat pricing, not a time-boxed automatic sale).

### Real gaps worth flagging (§15)
- No product/category/branch/customer targeting on Coupon, no per-customer redemption limit, no `max_discount` cap.
- No Promotion engine whatsoever (auto-apply campaigns, buy-X-get-Y, tiered/quantity discounts, cash-back campaigns) — the single biggest capability gap here; worth depends on whether the business runs this kind of marketing today.
- No Discount engine whatsoever (automatic, always-on, priority-ranked category/brand markdown).
- No day/time-window coupon restrictions; minor tooling gaps (bulk-generate, CSV import, name field).

**Architecture difference, not a gap:** coupon OTP verification (needs SMS infra we haven't built for this) and stacking-exclusivity flags (we currently let coupon + manual discount + loyalty points all stack — a defensible default, just not configurable per-coupon like the reference).

---

## 16. SMS / Notifications / Notification Templates

### 16.1-16.2 Provider & template architecture

Reference supports 4 pluggable SMS providers (Nexmo/Twilio/Unifonic/generic-HTTP); we hardcode Unifonic only — a reasonable choice (it's a real Saudi/MENA gateway option in the reference's own list) but not pluggable. Reference has a genuine generic templating engine (`NotificationTemplate`: per-trigger subject/sms/email/whatsapp body, placeholders, independent auto-send toggles per channel, admin-editable) — **we have one hardcoded English string** baked directly into `sale.service.ts`, no bilingual support, no admin customization.

**Important finding**: tracing every call site in the reference shows only `new_sale` and (partially) `new_ticket` are actually auto-fired via the template engine — everything else declared (`payment_received`, `overdue_payment`, `new_booking`, etc.) exists as an editable template but is either manual-send-only or driven by a completely separate mechanism (see below). So the reference's *template engine* itself is more thinly wired than its schema suggests.

### 16.3 What actually triggers automatic SMS in the reference — the laundry-relevant part

Two other mechanisms, separate from the template engine, do the real work:
- **`delay_message`** (5-min cron): fires when an order has sat at a given `shipping_status` for ≥N days. Configured against the laundry-module-specific status list (`ordered→under_cleaning→cleaned→ready→delivered`), a `delay_message` on `status='ready'` is literally **"your order is ready for pickup"** — admin-configured, not built-in-automatic, and polled every 5 minutes (not instant).
- **`checkSMS()`** (same cron): overdue-payment reminders, computed from payment terms/due date.

**Our side, confirmed built and NOT blocked** (the doc's prior "blocked on provider choice" note is stale) — `notifications/` is live: per-org encrypted Unifonic credentials, a never-throw `sendSms()` that logs a `TEST` status when unconfigured, and full audit logging (`NotificationLog`, arguably richer than the reference's equivalent). **One trigger is already wired — order-ready/order-delivered** (`sale.service.ts` `updateItemStatus()`), firing instantly on the real status transition with per-order dedup (one SMS per order, not per garment) — this is actually **better-engineered than the reference's 5-minute cron poll**.

### Real gaps worth flagging (§16)
- No generic notification-template engine — one hardcoded English string, no bilingual support, no admin customization, no way to add a new trigger's wording without a code change.
- Only one trigger wired. Confirmed present in the reference but missing on ours: payment-received confirmation, payment/overdue-payment reminders, new-sale/invoice-created SMS, admin-configured marketing broadcast, manual on-demand "send notification" from a transaction screen.
- No email or WhatsApp channel (reasonable scope choice for now, not urgent).

**Not a gap, worth protecting:** our never-throw fallback and real-time dedup-aware order-status trigger are both more robust than the reference's equivalents — don't regress either while building out the template system.

---

## Modules reviewed so far
- [x] Business Locations, Messages, Announcements, SAP B1 (overview)
- [x] Auth / Users / Roles / Business Settings (§5)
- [x] Contacts — Customers & Suppliers (§6)
- [x] Products / Categories / Brands / Units / Tax Rates / Services (§7)
- [x] POS / Sells checkout transaction engine (§8)
- [x] Purchases / Purchase Orders / Purchase Returns (§9)
- [x] Sell Return / Credit Note (§10)
- [x] Stock Adjustments / Stock Transfers / Inventory Posting (§11)
- [x] Compensations / Reparation (§12)
- [x] Payments / Accounts / Accounting Reports (§13)
- [x] Reports Triage (§14)
- [x] Promotions / Coupons / Discount (§15)
- [x] SMS / Notifications / Notification Templates (§16)

## 17. Bookings — no reference equivalent, our implementation stands on its own

**Correction to an earlier assumption**: "Booking" in the reference isn't purely restaurant table reservation. For this specific client, the base restaurant fields (`table_id`, `waiter_id`, `correspondent_id`) were explicitly **dropped** (2024-12 migration) and replaced with `transaction_id`, `slots` (time-of-day), and `total` — i.e. this client repurposed it into a **pre-sale service appointment**: customer + address (captured via Google Places, written onto the Contact) + a chosen time slot + assigned staff + pre-loaded expected line items, confirmed via SMS, later converted into a POS sale. Still, this is fundamentally different from our `Booking` model — it's an appointment that *generates* a sale, not a schedule for *fulfilling* an existing order.

The only other adjacent concepts: `shipping_status` (a post-sale fulfillment-stage **label**, no date/time attached) and `sell_due_date` (a single date stamped on the sale at checkout, no time-of-day, no capacity, no driver). **Neither is a pickup/delivery scheduler**, and none of the three reference concepts do what our `bookings` module does (an independently-tracked entity scheduling pickup/delivery logistics against a customer, optionally linked to a sale).

**Conclusion: no reference equivalent to compare against — mark this "stands on its own merits."** Two ideas worth borrowing as optional future enhancements, not gaps (since there's nothing to be "behind" on): (1) staff/driver assignment with a double-booking conflict check (ours has no assignee field at all today), and (2) a configured slot list rather than a bare free-datetime picker (gives a natural place to add real per-slot capacity later).

---

## 18. Loyalty — Qitaf/Mokafaa / Cashback / Online Payments (BNPL)

### 18.1 Qitaf & Mokafaa — external Saudi loyalty-network integrations, not internal features

Both are third-party point-redemption networks (STC Qitaf, Mokafaa) the reference integrates via **full bank/telecom-grade APIs**: mutual-TLS certs (Qitaf) or RSA-signed payloads over OAuth2 (Mokafaa), OTP-verified customer redemption, point accrual, and reversal — each exposed as a dedicated payment-tender option at POS (cashier enters customer mobile → OTP → redeem amount), configured per-org via 8-10 credential fields. **We have zero equivalent, confirmed by exhaustive grep.**

### 18.2 Cashback — smallest, most self-contained gap of the three

`Contact.cash_back` + a `cashback_transactions` ledger, fed from three sources (manual staff grant, automatic promotion-driven grant, compensation-settlement grant — cross-ref §12.4), redeemable as a real POS payment method routed to a per-branch accounting account, with promotion-scoped expiry via a daily cron. **We have no `cashBack` field, no ledger, no expiry job** — our `Customer.rewardPoints` is a different, purely internal points mechanism. Unlike BNPL/Qitaf/Mokafaa, this requires **no third-party integration or business decision** — pure internal feature work, cheapest of the three gaps to close.

### 18.3 Online Payments / BNPL (Tamara, Tabby, MISPay)

Three full gateway integrations, same shape: create session (cart + customer phone) → QR/deeplink shown at register → cashier polls status → capture/cancel. Each has materially different payload requirements (Tabby requires buyer-history risk-scoring data even for in-store purchases; MISPay layers custom AES-256-GCM token decryption). **We have zero equivalent** — our `PaymentMethod.code: "ONLINE"` is a label with no gateway logic behind it at all.

(Reference's `PesaPalController` is the *platform's own* subscription-billing gateway — analogous to our `billing/paymentGateway.ts` Moyasar integration — not a customer-facing BNPL option; correctly out of scope, noted only to avoid confusion.)

### Real gaps worth flagging (§18) — with priority assessment
- **BNPL — highest business value, but needs a merchant-relationship decision before any code.** BNPL is mainstream in Saudi retail; a laundry business offering installments on large orders (curtains, carpets, bulk contracts) is a plausible differentiator. Not a speculative build — needs a real merchant account/contract with whichever provider(s) the business chooses first.
- **Qitaf/Mokafaa — lower urgency, same "needs a decision" caveat, heavier lift** (government/telecom-grade credentialing with real lead time). Flag as a known capability gap, not a near-term build absent an existing merchant relationship.
- **Cashback ledger — cheapest to close, no external dependency.** Pure internal feature using patterns we already have prior art for (ledger tables, cron-based expiry already needed for reward points per §5.3).

---

## 19. Printers / Invoice Layouts / Invoice Schemes

### 19.1 Printer — physical device config

Network/USB/OS-print-queue connection details, thermal-printer capability profile (command-set per hardware model), chars-per-line. **We have none of this** — browser `window.print()` only, no thermal-printer targeting at all.

### 19.2 Invoice Layout & Design — the depth behind the §1.1/§1.5 finding

`InvoiceLayout` is one saved preset with **~30 independent show/hide toggles** (show_logo, show_barcode, show_qr_code, show_previous_bal, show_sales_person, etc.) and **~30 free-text label overrides** (every heading/label on the invoice is merchant-editable, bilingual-capable), plus logo upload, accent color, and configurable QR-field selection. `design` is a separate concept — a string key into a 14-template catalog (`classic`/`elegant`/`slim`(80mm)/`slim2`(58mm)/etc.) — **including three dedicated laundry-specific templates** (`laundry`, `laundry2`, `laundry3`). A branch can use different layouts for sale-order vs. POS receipt vs. sell-return.

**We have one fixed hardcoded React component** — no toggles, no configurable labels, no logo placement, no alternate paper-width variant, no per-branch/per-transaction-type selection. This is the entirety of the gap: one template vs. a library of 14 designs plus ~60 configurable fields on top.

### 19.3 Invoice Scheme — numbering, and the ZATCA-separation question

Reference: configurable prefix, optional year-in-number, `start_number` floor, configurable zero-pad width, optional per-terminal/per-branch splicing, **five independent parallel counters** for quotations/drafts/child-invoices/returns/reissues (separate from the main sequence), a native yearly-reset DB event, and per-branch selection between a direct-sale scheme and a separate POS scheme.

**Ours**: `pos.service.ts`'s `generateInvoiceNumber()` is a single hardcoded `INV-` prefix with one global per-organization counter (`tx.sale.count()`+1) — no floor, no configurable padding, no yearly reset, no separate counters per document type. **Also flagging separately**: this is count-based rather than a persisted atomic counter, which is a potential race under concurrent checkouts — a correctness question independent of the scheme-feature gap, worth a dedicated look.

**Critical finding — this is safe to build without touching ZATCA compliance.** ZATCA cares only about the **ICV** (a separate, strictly-sequential, gapless counter folded into the hash chain in `hashChain.service.ts`) — never the human-readable `invoiceNumber`. The reference's whole scheme machinery (prefixes, year-in-number, resets) sits on top of, and is fully independent from, its own ZATCA fields, exactly mirroring our separation between `invoiceNumber` and `icv`. **Building reference-style invoice-number scheming is safe as long as it stays wired to `invoiceNumber` only and never touches `icv`/`hashChain.service.ts`.**

### Real gaps worth flagging (§19)
- **Lower risk (pure UI/config, no compliance surface):** no `Printer` model, no `InvoiceLayout` toggles/labels/logo/color, no design-template catalog (including no laundry-specific templates despite this being a laundry system), no per-branch/per-transaction-type layout selection.
- **Medium risk (touches numbering, but separable from ZATCA):** no `InvoiceScheme` equivalent — single hardcoded prefix, single global counter, no yearly reset, no per-document-type counters. Safe to build as long as `icv` generation stays untouched.
- Separately flagged: current invoice-number generation is count-based, not an atomic persisted counter — worth checking for a concurrency race independent of any scheme feature work.

---

## 20. Expenses / Commission Agents

### 20.1-20.2 Expense — a `Transaction` type variant, simpler than expected

Same pattern as sells/purchases/compensations: no separate `Expense` table, just `type='expense'` (or `'expense_refund'`) on the shared `Transaction`. Fields: category, staff attribution, optional supplier, branch, a single flat tax rate (no line items), full recurring-expense scheduling with a cron-driven generator, receipt/document upload, an **optional** draft/approval toggle (business-level setting, not mandatory), and reuses the same due/partial/paid payment-status machinery as sales. Expense Categories are a flat taxonomy — just name + optional code + optional linked accounting-account (ties into §13.1) — no budget/target fields, no hierarchy.

**We have none of this** — no `Expense`/`ExpenseCategory` model anywhere, confirmed via grep (consistent with §12.4's finding).

### 20.3 Commission — two separate, unconnected mechanisms, both report-only

**(a) Flat-rate agent**: a pseudo-user (`is_cmmsn_agnt`, `cmmsn_percent`) assigned to a sale; commission is **never calculated or posted at sale time** — it's a pure report-time `SUM()` calculation against either invoice value or payments collected, rerun on demand. No ledger, no payable, no payout run — presumably paid manually outside the system.

**(b) Target-based scheme**: a completely different, unrelated feature despite the name — a named incentive scheme with per-product sales targets, reported as attainment percentage. Also purely a report, no auto-payout.

**We have neither concept in any form** — confirmed via grep, no commission field anywhere in our schema or modules.

### Real gaps worth flagging (§20) — with priority assessment
- No expense tracking at all — nothing the business spends outside purchases/compensations is visible to the system today.
- No expense categories, recurring automation, draft/approval, or receipt upload.
- No commission-agent concept in any form — if staff earn sales commissions today, that math happens entirely outside the system.

**Priority call: a basic Expense feature is a legitimate quick win, independent of the §13 Chart-of-Accounts foundation.** The reference's own expense record barely touches accounting — it's just a categorized, taxed, optionally-recurring transaction with a payment-status lifecycle we already have prior art for (sales/purchases). The ledger-posting and category→account link are additive, not load-bearing. Commission features are lower priority — pure reporting sugar over data we don't currently attribute (no per-sale agent assignment exists), reasonable to defer unless commission-based staff pay is an active pain point.

---

## Modules reviewed so far — audit complete
- [x] Business Locations, Messages, Announcements, SAP B1 (overview)
- [x] Auth / Users / Roles / Business Settings (§5)
- [x] Contacts — Customers & Suppliers (§6)
- [x] Products / Categories / Brands / Units / Tax Rates / Services (§7)
- [x] POS / Sells checkout transaction engine (§8)
- [x] Purchases / Purchase Orders / Purchase Returns (§9)
- [x] Sell Return / Credit Note (§10)
- [x] Stock Adjustments / Stock Transfers / Inventory Posting (§11)
- [x] Compensations / Reparation (§12)
- [x] Payments / Accounts / Accounting Reports (§13)
- [x] Reports Triage (§14)
- [x] Promotions / Coupons / Discount (§15)
- [x] SMS / Notifications / Notification Templates (§16)
- [x] Bookings (§17)
- [x] Loyalty — Qitaf/Mokafaa / Cashback / Online Payments (§18)
- [x] Printers / Invoice Layouts / Invoice Schemes (§19)
- [x] Expenses / Commission Agents (§20)

All laundry-relevant modules have now been audited. SAP B1 (§4) remains deliberately deferred to last per explicit instruction.

---

# Final Prioritized Punch List

Synthesized from all 20 sections above. Tiered by a combination of: how directly it affects daily
operations, how much of the groundwork already exists, and whether it can start today or needs a
business decision first. Section references (§N) point back to the detailed finding.

Already shipped during this audit (Phase 5, before this punch list was written): per-branch
self-contained fields incl. `branchNameAr`/`buildingNo`/`receiptPrinterType`/default price list
(§1, P5-3), Messages read-tracking (§2, P5-1), Announcements multi-location targeting (§3, P5-2), and
the Cash Register transaction ledger + denominations (§1.6/§13, P5-4). These are **not** repeated below.

## Tier 0 — Correctness fixes (small, do regardless of roadmap)

These aren't "gaps vs. the reference" so much as bugs the audit happened to surface. Cheap, low-risk,
worth doing before or alongside anything else:

- **Invoice-number generation race condition** (§19.3) — `generateInvoiceNumber()` derives the next
  number from `COUNT(*)`, not a persisted atomic counter; concurrent checkouts could theoretically
  collide. Independent of any invoice-scheme feature work.
- **`Customer` has no `openingBalance` field** (§6.1) — `Supplier` correctly has both `openingBalance`
  and `balance`; `Customer` only has `balance`. New customers can't be onboarded with a carried-over
  due amount. Looks like a straight asymmetry bug, not a design choice.
- **No duplicate-phone check on customer/supplier creation** (§6.1) — the same number can be entered
  on multiple records today, which breaks phone-based lookup at POS.
- **No `creditLimit` field on `Supplier`** (§6.2) — only `Customer` has one; can't cap purchase-on-
  account exposure per supplier.
- **No delete/cancel endpoint for Sell Returns or Compensations** (§10.5, §12.3/§12.5) — a mis-entered
  return or claim can't be voided through the API as built, only left in whatever state it's in.

## Tier 1 — Highest value, foundational (start here)

The gaps that most directly affect how the business runs day-to-day, where the "how the system
works" behavior genuinely diverges from what a multi-branch Saudi laundry operation needs:

- **Sales Order / Quote pipeline** (§8.3) — the single most consequential POS finding. No durable,
  ID-addressable, server-priced "drop off, get a quote, confirm later" document exists; `HeldSale` is
  an ephemeral same-shift cart-park, not a real quote. Directly relevant to the core laundry workflow.
- **Apply an existing store-credit balance to a later, unrelated sale** (§10.2/§10.4) — `Customer.balance`
  can already go negative (the data primitive exists via Sell Return), but nothing reads and applies
  it against a different future invoice. This is the single biggest Sell-Return/Credit-Note gap.
- **Compute and surface a service due/ready date** (§7.2) — `Service.estimatedProcessingHours` is
  captured today and never used anywhere. No promised completion date is ever calculated, stored, or
  shown to staff or customers — a basic, customer-facing "when will my order be ready" capability
  that's one wiring step away (the data already exists, unlike most gaps in this list).
- **Stock Transfer in-transit status / two-step commit-receive** (§11.2) — transfers are atomic and
  instantaneous today; no visibility into "shipped from branch A, not yet confirmed at branch B," no
  discrepancy detection. Becomes a real operational risk the moment transfers aren't same-day
  same-city van runs.
- **Organization / business settings screen + API** (§5.3) — there is currently no way to configure
  even basic org-wide settings (fiscal year start, numbering, email/SMS sending config) without a
  direct DB edit. Foundational — several other Tier 2 items (invoice numbering, notification
  templates) naturally live under this same settings surface.
- **Role CRUD** (§5.2) — `roles.create/update/delete` permission codes already exist in code with no
  endpoint behind them; every org is stuck with a fixed 13-role catalog. High leverage relative to
  effort since the permission plumbing is already there.

## Tier 2 — High value, moderate effort

Real, well-evidenced gaps that materially help the business but aren't blocking core operations the
way Tier 1 is:

- **Reports: sales-by-service breakdown, AR/AP aging, staff productivity, VAT breakdown** (§14) — our
  entire report surface is 3 aggregate endpoints; the reference has ~69. These four are the highest-
  value misses for a laundry owner specifically (what sold, who owes us and for how long, who's
  productive, VAT filing sanity check).
- **Compensation resolution-type wiring** (§12.4) — marking a claim "paid" today does nothing; the
  `Coupon` and `LoyaltyTransaction` primitives it would auto-trigger already exist elsewhere in our
  schema, just never invoked from compensations. The cash/expense side needs Tier 3's Expense model
  first; the points/coupon side can be wired sooner.
- **Coupon targeting + per-customer redemption limit + `max_discount` cap** (§15.2) — real
  abuse-prevention and margin-protection gaps on a feature we already have; a coupon today discounts
  the whole cart org-wide with no per-branch/customer/category scoping and no independent ceiling on a
  percentage discount.
- **Notification templates + more auto-send triggers** (§16) — one hardcoded English string today, no
  bilingual support, no admin customization. Order-ready SMS already works and is well-engineered;
  payment-received confirmations and payment/overdue reminders are the highest-value additions.
- **Per-branch invoice/receipt layout, printer config, and invoice numbering scheme** (§19) — confirmed
  **safe to build without touching ZATCA compliance** (the ICV/hash-chain sequence is fully independent
  of the human-readable invoice number in both systems). Currently one hardcoded template and one
  global counter; the reference's field-level toggle/label system and multi-counter scheme are UI/config
  work, not a compliance rewrite.

## Tier 3 — Real, lower urgency, or needs more groundwork

Confirmed gaps, genuinely useful, but either narrower in impact or dependent on something else landing
first:

- **Basic Expense tracking** (§20) — no `Expense` model at all today. The audit's own assessment: this
  is a legitimate quick win *independent of* the Chart-of-Accounts question in Tier 4 — a categorized,
  taxed, optionally-recurring transaction with a payment-status lifecycle we already have prior art
  for (sales/purchases). Ledger integration is additive, not required to be useful.
- **Cashback ledger** (§18.2) — cheapest of the three Loyalty/BNPL gaps to close; no third-party
  integration or business decision needed, just a ledger table + balance field + redemption-as-payment
  flow + promotion-scoped expiry, all patterns we already have elsewhere.
- **Customer-group spend/volume caps + customer approval workflow** (§6.4) — plausible real need for
  corporate/hotel accounts with monthly credit ceilings; lower urgency than Tier 1/2 items.
- **Stock Adjustment loss classification, cost-recovery field, reversal endpoint** (§11.1) — real gaps,
  narrower scope than the Transfer in-transit gap in Tier 1.
- **Per-user access restrictions** (non-login staff records, per-cashier discount ceiling, per-customer
  access, per-user stock-transfer-location restriction — all §5.1) — real but each is a narrow
  permission-model addition, most valuable once Role CRUD (Tier 1) exists to actually assign them
  through.
- **Compensation approve/pay segregation of duties + multi-item claims** (§12.5/§12.1) — real
  workflow gaps, secondary to the resolution-type wiring in Tier 2.
- **Promotion engine and Discount engine** (§15.1/§15.4) — the biggest capability gap in the
  Promotions/Coupons/Discount audit, but a genuinely large build (scheduled campaigns, buy-X-get-Y,
  automatic catalog markdowns). Worth confirming with the business whether they actually run this kind
  of marketing today before investing — could as easily be Tier 4.
- **Per-branch payment-account routing** (§1.1/§13.2) — only becomes valuable once a Chart of Accounts
  (Tier 4) exists to route into; tracked here as "ready to build the moment §13 is greenlit," not
  independently actionable before that.

## Tier 4 — Needs an explicit business decision before any code

Not a priority ranking failure — these are blocked on information only the business owner has:

- **BNPL — Tamara / Tabby / MISPay** (§18.3) — highest potential business value of anything in this
  tier (BNPL is mainstream in Saudi retail), but requires a real merchant account/contract with
  whichever provider(s) the business chooses first. Not speculative-buildable.
- **Qitaf / Mokafaa** (§18.1) — lower urgency than BNPL, same "needs a decision" caveat, and a heavier
  lift (government/telecom-grade credentialing with real lead time even after a decision is made).
- **Full double-entry Chart of Accounts** (§13) — the single biggest "big lift, uncertain value" item
  in the entire audit. The audit's own honest assessment: this is a different *category* of system
  (bookkeeping software bolted onto a POS), not a laundry-domain feature — recommend treating as
  explicitly out of scope unless the business intends this system to fully replace their external
  bookkeeper and become their actual books of record. Confirm directly with the business owner before
  scoping any work here; if the answer is no, most of §13's sub-gaps (bank deposits, balance sheet,
  per-branch account routing) become moot too.

## Tier 5 — Deferred to absolute last (explicit standing instruction)

- **SAP B1 integration** (§4) — full bidirectional Service Layer sync across ~15 data types. Confirmed
  one of the largest single pieces of functionality in the reference system. Per direct user
  instruction, this does not start until everything else above is either built or explicitly
  deprioritized by the business.

## Notably *not* gaps — things this audit confirmed we already do as well as or better than the reference

Worth keeping visible so none of these get "fixed" by mistake in a future pass: bilingual (`nameEn`/
`nameAr`) fields on `Category`/`Brand`/`Unit`/`Tax`/`Product`-description/`Customer`/`Supplier` where the
reference is English-only (§6, §7); our `InventoryTransaction` audit trail is more reliable than the
reference's `StockActivityLog`, which is dead code in the reference codebase (§11.4); our Compensation
status lifecycle (real reject state, claimed-vs-approved split) is richer than the reference's, which
auto-collapses to two states with no reject at all (§12.3); our real-time, dedup-aware order-ready SMS
trigger beats the reference's 5-minute cron poll (§16); our additive, audit-trail-preserving Purchase
Returns beat the reference's overwrite-in-place pattern (§9.3); per-line-item `fulfillmentStatus` is
more granular than the reference's transaction-level `shipping_status` (§1.3); and our Business
Locations self-contained fields, Cash Register ledger, Messages read-tracking, and Announcements
multi-location targeting (all shipped in Phase 5 during this audit) close what were previously the
four best-understood gaps in the whole comparison.
