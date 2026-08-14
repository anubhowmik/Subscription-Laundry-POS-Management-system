# POS Module — ZATCA-Compliant Redesign: Implementation Plan

Status: **Phases A, B, C, D implemented.** Phase D's integration layer is built and makes real
HTTP calls to ZATCA's sandbox host, but has no valid credentials to complete onboarding with —
see "Phase D status" below for exactly what that means in practice.

Scope: POS module only. All other modules (laundry order workflow, delivery, accounting, CRM,
SAP B1) are explicitly out of scope for this plan.

## Implementation status (updated after Phase C)

**Phase A — data model & hash chain.** Done. `Sale.icv`/`previousInvoiceHash`/`invoiceHash`,
atomic per-location ICV increment, SHA-256 chain. Checkout blocks (with a clear error) if the
customer has no Arabic name or the business location has no VAT number.

**Phase B — QR + printable invoice.** Done. 5-field TLV QR (fallback path), bilingual
printable tax invoice at `/invoices/:id` with the QR rendered as a real PNG.

**Phase C — cryptographic layer.** Done and tested, not just written:
- EC secp256k1 key generation + PKCS#10 CSR construction (`backend/src/modules/zatca/csrGenerator.service.ts`).
  Built by hand with `asn1js` because `node-forge` (initially tried) turned out to only support
  RSA/Ed25519, not arbitrary EC curves — confirmed by testing, not assumed. **Independently
  verified valid by OpenSSL** (`openssl req -verify`), including a real CSR generated through
  the actual API (not just a standalone script).
- AES-256-GCM encryption for private keys at rest (`backend/src/utils/secretBox.ts`).
- Certificate/onboarding API: `POST /api/zatca/certificates/:locationId/generate`,
  `GET /api/zatca/certificates/:locationId/status`. UI on the Business Locations page.
- UBL 2.1 invoice XML generator (`xmlGenerator.service.ts`) — well-formed, correct namespace
  handling (fixed an early bug where namespaces were redeclared on every element).
- Canonical XML hashing + ECDSA-with-SHA256 signing
  (`digitalSignature.service.ts`) — **round-trip verified**: signature checks out against the
  stored XML/public key, and correctly fails against tampered content.
- QR extended from 5 to 8 fields (adds invoice hash, signature, raw EC public key). Field 9
  (ZATCA's own signature over our public key) can't exist until Phase D gives us a
  ZATCA-issued certificate to embed.
- Checkout automatically uses the full signed pipeline once a location has a certificate, and
  cleanly falls back to Phase A's JSON-hash path otherwise — verified both paths work with no
  regression.
- A real bug was caught and fixed during this work: `Buffer.buffer` returns Node's *shared
  memory pool*, not just that buffer's bytes, when the buffer is small - an early CSR was
  silently corrupted with leaked adjacent memory (looked like a stray webpack source map) until
  this was caught by testing against OpenSSL rather than trusting the code.

**What Phase C deliberately does NOT include**: the `ext:UBLExtensions` XAdES
cryptographic-stamp envelope inside the XML itself. That requires embedding a ZATCA-issued
X.509 certificate, which doesn't exist until Phase D's onboarding calls succeed. Fabricating a
stamp-shaped block without a real certificate to put in it would look official while being
wrong — worse than not attempting it. The real signature/public key are stored on the `Sale`
row instead (`digitalSignature`, `publicKeyPem`) and shown on the printable invoice.

## Phase D status

**Built**: `zatcaApiClient.service.ts` (Compliance CSID exchange, compliance invoice checks,
Production CSID exchange, Clearance, Reporting - all real HTTP calls via Node's native
`fetch`, Basic-auth header construction, structured error handling), the onboarding
orchestration in `certificate.service.ts` (`exchangeComplianceCsid`, `exchangeProductionCsid`,
credential storage/encryption, status tracking with error capture), the
`POST /api/sales/:id/submit-to-zatca` endpoint wired to Clearance/Reporting based on invoice
type, and UI for all of it (OTP entry modal on Business Locations, "Submit to ZATCA" on the
printable invoice).

**Tested against the real ZATCA sandbox host** (not just written) — with a placeholder
OTP (`123456`), since there's no confirmed real Fatoora portal registration yet:

```
POST https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance
→ HTTP 400, body: "Invalid Request"
```

What this tells us:
- The base URL and `/compliance` path are real and reachable — this **didn't** 404 or fail DNS
  resolution, which it would have if the endpoint didn't exist. That's a meaningfully better
  signal than pure guesswork.
- The plain-text `"Invalid Request"` (not a structured JSON validation error) suggests this is
  a gateway-level rejection before reaching real business-logic validation — could be the OTP
  header name/format, the CSR field encoding, a missing required header, or something else
  entirely. There isn't enough signal in that response to know which.
- **This cannot be narrowed down further without either ZATCA's current API reference
  documentation or a real OTP from an actual portal registration.** I'm not going to guess
  further and represent it as fixed — that's exactly the kind of false confidence this plan
  committed to avoiding from the start.

Error handling itself works as designed: the failure was caught, logged with ZATCA's actual
response body preserved (`lastError` on `ZatcaDeviceCertificate`), surfaced cleanly to the UI,
and the certificate record stayed in a retryable state rather than getting corrupted.

**What's still needed before this can go further:**

1. **ZATCA Fatoora portal registration** for this business (CR number, ability to receive a
   real OTP). Not something I can do without you — flagged since the start of Phase D.
2. **ZATCA's current API reference** (exact request/response JSON shapes, header names) to
   replace the best-guess request format in `zatcaApiClient.service.ts` with the documented one.
3. Once a *real* OTP succeeds and a Compliance CSID comes back, confirm the CSR's Subject DN
   field mapping (`serialNumber`/`title`/`registeredAddress`/`businessCategory`) and the
   invoice-type-support flag (`"1100"`) are accepted — ZATCA's compliance-invoice-check step
   will surface it clearly if not.
4. Once real Compliance/Production certificates exist, build the actual `ext:UBLExtensions`
   XAdES signature envelope for submission - deliberately deferred (see Phase C section above)
   because faking it without a real certificate to embed would be worse than not attempting it.

---

## 1. Current Architecture Analysis

What exists today (`backend/prisma/schema.prisma`, `backend/src/modules/pos/`,
`backend/src/modules/sales/`, `frontend/src/pages/pos/PosPage.tsx`):

- **`Sale`** model: `id` (internal UUID), `invoiceNumber` (plain sequential string,
  `INV-000001`, generated by `count()+1` in `pos.service.ts:generateInvoiceNumber`),
  `subtotal`/`discountAmount`/`taxAmount`/`totalAmount`/`paidAmount`/`dueAmount` as
  `Decimal(12,2)`, `status` (DRAFT/FINAL/CANCELLED), `paymentStatus`. No invoice-type
  distinction, no ZATCA identifiers of any kind.
- **`SaleItem`**: per-line `taxPercent` snapshot + `taxAmount`, correct INCLUSIVE/EXCLUSIVE
  handling. This is the right foundation for line-level tax breakdown but has no tax
  *category* (standard/zero-rated/exempt), only a rate.
- **`Tax`** model: name, `percentage` (Decimal 5,2), `taxType` (free string, currently only
  `"VAT"`). Configurable, not hard-coded — good — but has no ZATCA tax category code.
- **`BusinessLocation`**: already has `vatNumber`, `crNumber`, `nationalAddress`,
  `businessNameEn/Ar` — this is exactly the seller-identity data an e-invoice needs, just not
  wired into any invoice document yet.
- **`Customer`**: already has `vatNumber`/`crNumber`/`nationalAddress` — the buyer-identity
  fields a Standard (B2B) Tax Invoice needs. `nameAr` is currently **optional** — a compliance
  problem (see §7).
- **`pos.service.ts checkout()`**: single Postgres transaction (sale + items + stock + payment
  + customer balance) using `Prisma.Decimal` throughout — no floating point. This transactional
  discipline is correct and should be preserved/extended, not replaced.
- **Nothing exists yet for**: invoice UUID, ICV (Invoice Counter Value), PIH (Previous Invoice
  Hash), invoice hash, digital signature, cryptographic stamp, QR code, XML generation, CSR/CSID
  management, Clearance/Reporting API calls, Credit/Debit Notes, offline queue, invoice
  lifecycle status, shifts/cash drawer, hold/resume, returns, receipt printing.

**Bottom line**: the money-math and transactional core is solid and can stay. Everything
ZATCA-specific is greenfield.

---

## 2. Missing POS Features (non-ZATCA)

| Feature | Status |
|---|---|
| Shift open/close, cash drawer, cash-in/out | Not built |
| Hold sale / resume sale | Not built |
| Split payment across methods (partially supported — multiple `payments[]` accepted, but no UI helper to auto-split) | Partial |
| Returns / exchange | Not built (no `SaleReturn` model yet, despite being in the original spec) |
| Receipt printing (thermal/A4), gift receipt | Not built — no receipt template at all |
| Price lists / selling-price groups | Not built |
| Loyalty points, cashback, coupons | Not built |
| Recent transactions panel, reprint | Not built |
| Reports: daily sales, cash, shift, VAT, product, audit | Only a basic dashboard summary exists |
| Barcode scanner UX | Basic (Enter-key exact match) — works but not tuned for continuous scan-to-cart |

## 3. Missing Saudi Arabia / ZATCA Compliance Features

Everything in your list is currently missing. Grouped by what actually blocks go-live vs. what's
enhancement:

**Blocking (legally required for any VAT-registered seller issuing invoices):**
- Invoice UUID, sequential ICV, PIH hash chain, invoice hash (SHA-256)
- QR code (Base64 TLV) — 5-field for Phase 1, 9-field once digitally signed (Phase 2)
- Standard Tax Invoice vs Simplified Tax Invoice distinction (drives Clearance vs Reporting)
- Arabic content on the invoice (mandatory, English may accompany it)
- Immutability: no hard-delete/edit of a cleared/reported invoice — corrections via Credit/Debit
  Note only
- Time sync (NTP) — invoice timestamps must be trustworthy

**Blocking only if you're already in a ZATCA Phase 2 integration wave** (revenue-threshold
based — need to confirm which wave this business falls into):
- XML generation (UBL 2.1 + ZATCA extensions)
- Digital signature (ECDSA secp256k1) + cryptographic stamp
- CSR generation, Compliance CSID, Production CSID (onboarding via Fatoora Portal)
- Clearance API (Standard/B2B invoices — must be cleared *before* delivery to buyer)
- Reporting API (Simplified/B2C invoices — reported within 24h, delivered immediately)
- Credit Note / Debit Note submission through the same Clearance/Reporting pipeline
- Offline queue with automatic sync + retry

I'm treating the second group as required (per your instructions to always follow ZATCA over
convenience), but flagging it because it's the expensive, security-sensitive half of the work —
see the open questions at the end.

## 4. Missing Database Tables

New models needed (naming provisional):

- **`Invoice`** — either replaces or 1:1-extends `Sale` with: `zatcaUuid`, `icv` (int, per
  business location, strictly sequential), `previousInvoiceHash`, `invoiceHash`,
  `qrCodeBase64`, `xmlContent`, `digitalSignature`, `invoiceTypeCode` (STANDARD/SIMPLIFIED),
  `transactionTypeCode` (INVOICE/CREDIT_NOTE/DEBIT_NOTE), `clearanceStatus`
  (PENDING/CLEARED/REPORTED/FAILED/QUEUED_OFFLINE), `zatcaSubmittedAt`, `zatcaResponseRaw`
  (Json, full audit of what ZATCA returned)
- **`CreditNote`** / **`CreditNoteItem`** — linked to original `Sale`/`Invoice`, same hash-chain
  rules, reason code required
- **`DebitNote`** / **`DebitNoteItem`** — same pattern, for undercharges/adjustments
- **`ZatcaDeviceCertificate`** — per business location (ZATCA registers at the "device"/unit
  level): `complianceCsid`, `productionCsid`, encrypted private key, certificate, `secret`,
  `onboardedAt`, status
- **`ZatcaInvoiceQueue`** — offline queue: invoice ref, payload, `attemptCount`,
  `nextRetryAt`, `status`
- **`Shift`** / **`CashMovement`** — open/close, opening float, expected vs counted cash,
  cash-in/cash-out entries, tied to `BusinessLocation` + `User`
- **`SaleReturn`** / **`SaleReturnItem`** — was already in the original spec's table list,
  never built; now doubles as the trigger for Credit Notes
- **`HeldSale`** — cart snapshot for hold/resume (or just a `Sale` in `DRAFT` status — cheaper,
  probably the right call)
- **`Tax`** gets a new field: `categoryCode` (`S` standard / `Z` zero-rated / `E` exempt / `O`
  out-of-scope) — required by ZATCA's UBL tax category codes, currently absent

## 5. Missing APIs

```
POST   /api/pos/hold
POST   /api/pos/resume/:id
POST   /api/pos/shifts/open
POST   /api/pos/shifts/close
GET    /api/pos/shifts/current
POST   /api/pos/shifts/:id/cash-movement

POST   /api/sales/:id/returns
POST   /api/invoices/:id/credit-note
POST   /api/invoices/:id/debit-note
GET    /api/invoices/:id/qr
GET    /api/invoices/:id/xml
GET    /api/invoices/:id/pdf            (receipt / tax invoice PDF)

POST   /api/zatca/onboarding/csr
POST   /api/zatca/onboarding/compliance-csid
POST   /api/zatca/onboarding/production-csid
POST   /api/zatca/invoices/:id/clear    (Standard)
POST   /api/zatca/invoices/:id/report   (Simplified)
GET    /api/zatca/queue                 (offline queue status, admin visibility)

GET    /api/reports/daily-sales
GET    /api/reports/vat
GET    /api/reports/cash
GET    /api/reports/shift/:id
```

All following the existing `{success, message, data, meta}` / permission-middleware /
pagination conventions already in place.

## 6. Missing Services (backend, `modules/**/*.service.ts` style, or a new `modules/zatca/`)

- `InvoiceHashService` — SHA-256 chain (hash of invoice N includes hash of invoice N-1)
- `XmlGeneratorService` — builds ZATCA's UBL 2.1 profile from a `Sale`
- `DigitalSignatureService` — ECDSA secp256k1 signing, cryptographic stamp assembly
- `QrCodeService` — TLV Base64 encoding (5-field, then 9-field)
- `CsrGeneratorService` — generates the CSR per ZATCA's exact subject-field spec
- `ZatcaApiClientService` — Compliance/Clearance/Reporting API calls, with retry/backoff
- `OfflineQueueService` — background worker draining `ZatcaInvoiceQueue`
- `ShiftService`, `CashDrawerService`, `ReturnService`, `CreditNoteService`

## 7. Missing Validations

- VAT number format (15 digits, must start and end with `3` per GCC convention)
- CR number format
- No edit/delete on a cleared or reported invoice — enforce at the DB/service layer, not just UI
- Credit/Debit Note total can't exceed the original invoice's remaining balance
- ICV must be gapless and strictly increasing per business location — detect and alert on any
  gap (indicates tampering or a bug)
- Hash-chain integrity check (recomputable at any time — should be part of an admin "verify
  chain" tool, not just trust-on-write)
- `Customer.nameAr` and equivalent Arabic fields need to become **effectively required** before
  an invoice can be issued to that customer (currently nullable in the schema — this is a real
  gap I introduced during the POS build and need to close)
- Server clock drift check against NTP before stamping invoice timestamps
- Currency must be SAR for ZATCA invoices (already the system default, just needs to be a hard
  invariant, not a convention)

## 8. Missing Invoice Workflow

```
Sale finalized in POS
        │
        ▼
Determine invoice type:
  buyer has VAT number & is B2B/B2G → STANDARD (Clearance)
  otherwise (walk-in, most laundry customers) → SIMPLIFIED (Reporting)
        │
        ▼
Compute ICV, PIH, invoice hash, QR, sign, build XML
        │
        ▼
STANDARD → submit to Clearance API BEFORE handing invoice to customer
           (blocking call — customer waits, or gets a provisional receipt + emailed cleared copy)
SIMPLIFIED → hand invoice to customer immediately, report to ZATCA async within 24h
        │
        ▼
On API failure/no connectivity → write to ZatcaInvoiceQueue, retry with backoff,
                                   surface queue depth to admins
        │
        ▼
Later correction needed → Credit Note or Debit Note, never edit/delete the original
```

## 9. Missing Tax Workflow

- Line-level tax category (not just rate) — standard/zero-rated/exempt must each be
  summarized separately in the XML's tax total breakdown
- Discount must reduce the taxable base *before* VAT is computed, and both pre- and
  post-discount amounts must appear distinctly on the invoice (partially there — `SaleItem`
  already separates `discountAmount` from `taxAmount`, needs to flow into XML correctly)
- ZATCA-specified rounding methodology (need to confirm at line level vs invoice level during
  implementation against the official spec/sandbox — this is a place I'd rather verify against
  ZATCA's technical documentation than assume from memory)

## 10. Development Roadmap

Ordered so each phase ships something usable, with the security-critical/irreversible work
sequenced after the data model is solid:

1. **Phase A — Data model & local invoice discipline.** `Invoice` fields, UUID/ICV/PIH
   scaffolding (hash chain computed but not yet ZATCA-submitted), invoice-type split
   (Standard/Simplified), Arabic-required validation. No external calls yet.
2. **Phase B — QR code + printable invoice.** Phase-1-style 5-field QR, a real printable
   tax-invoice/receipt template (thermal + PDF), immediately visible/testable value.
3. **Phase C — Cryptographic layer.** CSR generation, key management, hashing/signature
   services. Security-sensitive — build against ZATCA's sandbox, not guessed from memory.
4. **Phase D — ZATCA API integration.** Compliance API first (sandbox), then Clearance
   (Standard) and Reporting (Simplified), then Production CSID cutover.
5. **Phase E — Returns, Credit Notes, Debit Notes**, wired into the same hash chain.
6. **Phase F — Offline queue & resilience**, retry/backoff, admin visibility.
7. **Phase G — Remaining POS UX** (shifts, cash drawer, hold/resume, loyalty/coupons, reports)
   — not compliance-blocking, can interleave with the above based on what you need day-to-day
   first.

---

## Decisions (approved)

- **ZATCA timeline**: already required / has a deadline — full pipeline (Phases A–F) is the
  target, not optional future work.
- **Signing approach**: in-house (CSR generation, ECDSA secp256k1 signing, XML canonicalization
  built by us, not outsourced to compliance middleware).
- **Invoice mix**: predominantly Simplified/B2C (walk-in and individual customers) — the
  Reporting path is the priority; Standard/B2B Clearance is built for the corporate-account
  minority but is not the critical path.
- **Build order**: **Phase A + B first** — data model (UUID/ICV/PIH/hash chain, invoice-type
  split, Arabic-required validation) and QR code + printable invoice. No external ZATCA API
  calls in this slice; Phases C–F (signing, Clearance/Reporting, Credit/Debit Notes, offline
  queue) follow once A+B is solid and reviewed.
