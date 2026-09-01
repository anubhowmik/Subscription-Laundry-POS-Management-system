# Saudi Laundry Management System

A multi-tenant SaaS platform for running a laundry business in Saudi Arabia — point of
sale, orders, inventory, customers, staff & permissions, and ZATCA (Fatoora) e-invoicing.
Fully bilingual (Arabic/English, RTL/LTR) and VAT-aware throughout.

The product is organized as three applications, launched from a public Home page:

- **POS Laundry** — point of sale, orders, customers, inventory, purchases, expenses,
  bookings, reports
- **Users & Rules** — staff accounts, roles & permissions, per-app access control,
  subscription & per-seat licensing
- **ZATCA KSA** — Saudi e-invoicing compliance certificates per branch

New organizations get a 7-day free trial (unlimited seats during the trial) that starts
once the signup email is verified. After the trial, the org subscribes to a single base
plan (monthly/annual); additional user seats beyond the plan's included seat are a
one-time purchase, not a recurring charge.

## Tech stack

- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, i18next (Arabic/English, RTL/LTR)

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL, running locally (or reachable) on port 5432

### 1. Clone and install

```bash
git clone <this-repo-url>
cd laundry-management-system
npm install --prefix backend
npm install --prefix frontend
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:
- `DATABASE_URL` — your local Postgres connection string
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — any long random strings for local dev
- `ZATCA_ENCRYPTION_KEY` — a base64 32-byte key used to encrypt EC private keys at rest;
  generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

Create `frontend/.env`:

```
VITE_API_URL=http://localhost:4000/api
```

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev
npx tsx prisma/seed.ts
```

This creates the schema and seeds a starter organization with a default admin account
(`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` in `backend/.env` — change these before
using this anywhere near production).

### 4. Run the dev servers

Two terminals:

```bash
# Terminal 1 — backend (http://localhost:4000, Swagger at /api/docs)
npm run dev --prefix backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev --prefix frontend
```

Open **http://localhost:5173** in your browser.

### Resetting the database

```bash
cd backend
npx prisma migrate reset   # drops, recreates, re-runs migrations + seed
```

Or re-seed without wiping data: `npx tsx prisma/seed.ts` (idempotent).

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
- **One sale = one Postgres transaction**: sale + items + stock deduction + inventory
  ledger entry + payment + customer balance update all commit atomically or not at all.
- **RBAC**: permissions are granular (`products.view`, `sales.create`, …), not just role
  names, plus a separate `app.*` permission layer gating each of the three applications —
  enforced server-side on every route, not just hidden in the UI.
- **Business-location scoping** is enforced server-side — a Cashier assigned only to one
  branch cannot query another branch's data via the API, even by calling the API directly.
- **Email verification gates the trial**: the trial clock and subscription record don't
  start until the signup email is verified, not at registration time.
- **Billing and seat licensing are decoupled**: the subscription gate (`Organization`
  status + `Subscription` dates) is untouched by seat purchases, which only ever touch a
  purchased-seat counter — so a duplicated payment webhook can't double-grant seats or
  silently break access.
- i18n: UI strings live in `frontend/src/i18n/locales/{en,ar}.json`; database records use
  `nameEn`/`nameAr` pairs. Switching language flips `<html dir>` automatically.

## ZATCA e-invoicing

POS sales are ZATCA (Fatoora) compliance-ready: hash-chained invoices, QR codes, EC key
generation, CSR generation, real ECDSA digital signatures, and a Compliance/Production
CSID + Clearance/Reporting API client confirmed reachable against ZATCA's real sandbox
host. See [`docs/POS-ZATCA-PLAN.md`](docs/POS-ZATCA-PLAN.md) for exactly what's verified
versus what's still blocked on a real Fatoora portal registration.
