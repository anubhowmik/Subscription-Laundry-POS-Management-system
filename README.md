# Saudi Laundry Management System

Multi-branch laundry ERP for Saudi Arabia: POS, laundry orders, inventory, customers,
Arabic/English + RTL/LTR, VAT-aware invoicing. Built per `Saudi Laundry Management System -
Specification.pdf`.

## Status

**Phases 1–6 of the spec's own roadmap are done**: project setup, auth/RBAC, business
locations, master data (customers, products, services, categories, brands, units, taxes),
inventory (stock tracking + movement history), and Sales/POS. Everything below that
(laundry order workflow, delivery, quotations, promotions, accounting, CRM, SAP B1) is not
built yet — those are separate phases we build next.

**POS is also ZATCA (Fatoora) e-invoicing ready through Phase D**: hash-chained invoices, QR
codes, EC key generation, CSR generation, real ECDSA digital signatures, and a Compliance/
Production CSID + Clearance/Reporting API client that's confirmed reachable against ZATCA's
real sandbox host — see [`docs/POS-ZATCA-PLAN.md`](docs/POS-ZATCA-PLAN.md) for exactly what's
verified vs. what's still blocked on a real Fatoora portal registration (needed to get a real
OTP and go further).

- `backend/` — Node.js + Express + TypeScript + Prisma + PostgreSQL
- `frontend/` — React + Vite + TypeScript + Tailwind + i18next (Arabic/English, RTL/LTR)

## Prerequisites

- Node.js 18+ (you have v24 installed)
- PostgreSQL running locally (already configured against your instance)

## Running in VS Code

1. **Open the project**: `File > Open Folder…` → select `D:\Claude\laundry-management-system`.
2. Install the recommended extensions when prompted, or manually: **Prisma** (Prisma.prisma),
   **Tailwind CSS IntelliSense**, **ESLint**.
3. Open **two terminals** (`` Ctrl+` ``, then click the `+` to split) — one for the backend,
   one for the frontend. Both `npm install`s are already done, so:

   **Terminal 1 — backend**
   ```bash
   cd backend
   npm run dev
   ```
   Runs on http://localhost:4000. Swagger docs at http://localhost:4000/api/docs.

   **Terminal 2 — frontend**
   ```bash
   cd frontend
   npm run dev
   ```
   Runs on http://localhost:5173 — open this in your browser.

4. **Login**: username `admin`, password `ChangeMe123!` (from `backend/.env`,
   `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` — change this before going anywhere near
   production).

`backend/.env` also needs `ZATCA_ENCRYPTION_KEY` (a base64 32-byte key used to encrypt EC
private keys at rest) — already set for this environment; regenerate with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` if you ever
rotate it.

### If you ever need to reset the database

```bash
cd backend
npx prisma migrate reset   # drops, recreates, re-runs migrations + seed
```

Or just re-seed without wiping data: `npx tsx prisma/seed.ts` (seed is idempotent).

### Useful commands

| Command (run inside `backend/`) | What it does |
|---|---|
| `npx prisma studio` | GUI to browse/edit the database |
| `npx prisma migrate dev --name <desc>` | Create a new migration after editing `schema.prisma` |
| `npm run build` | Type-check + compile to `dist/` |

| Command (run inside `frontend/`) | What it does |
|---|---|
| `npm run build` | Production build (also type-checks) |

## Architecture notes

- **Money is never floated**: all monetary fields are Postgres `Decimal`, and the POS
  checkout transaction uses `decimal.js` (via Prisma) for every calculation — no
  JavaScript float math touches financial totals.
- **All totals are server-computed.** The frontend shows a live preview, but the backend
  independently recalculates subtotal/tax/total from the database on every checkout — the
  client can't send a fake price.
- **One sale = one Postgres transaction**: sale + items + stock deduction + inventory ledger
  entry + payment + customer balance update all commit atomically or not at all.
- **RBAC**: permissions are granular (`products.view`, `sales.create`, …), not just role
  names. Seeded roles cover the spec's full list (System Admin, Admin, Store Manager,
  Cashier, Accountant, Inventory Keeper, etc.).
- **Business-location scoping** is enforced server-side (not just hidden in the UI) — a
  Cashier assigned only to "Main Branch" cannot query another branch's data via the API.
- **Tax is configurable**, not hard-coded — see the `Tax` table / `/api/taxes`.
- i18n: UI strings live in `frontend/src/i18n/locales/{en,ar}.json`; DB records use
  `nameEn`/`nameAr` pairs. Switching language flips `<html dir>` automatically.

## What's next

Pick whichever phase matters most to you next — natural order per the spec:

1. **Laundry order workflow** (Received → Washing → Ready → Delivered, item tracking with
   photos) — this is the spec's own "most important module" and is not built yet; current
   POS records a sale but not a garment-tracking order.
2. Pickup & delivery (drivers, delivery status)
3. Quotations, returns UI, promotions/coupons
4. Accounting module, reports
5. Notifications (SMS/email — needs a provider decision from you)
6. SAP B1 integration scaffolding
