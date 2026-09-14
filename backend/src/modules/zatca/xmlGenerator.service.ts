import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";

/**
 * Builds the core UBL 2.1 invoice body (parties, dates, lines, tax/monetary totals, and the
 * ZATCA PIH/ICV AdditionalDocumentReference entries) from a priced Sale.
 *
 * Scope note (see docs/POS-ZATCA-PLAN.md Phase C): this produces a genuinely well-formed UBL
 * 2.1 invoice - the element structure, namespaces, and party/line/tax semantics below follow
 * the standard UBL 2.1 Invoice schema (which ZATCA's format extends) with good confidence.
 * What this deliberately does NOT attempt is the `ext:UBLExtensions` XAdES cryptographic-stamp
 * envelope (the block that embeds the digital signature + X.509 certificate ZATCA issues).
 * That requires a real ZATCA-issued certificate to embed (Phase D - we only have a locally
 * generated CSR/keypair right now, no certificate ZATCA has signed), and XAdES's exact nesting
 * is one of the highest-risk-of-being-wrong parts of the whole spec. Embedding something that
 * merely *looks* like a valid cryptographic stamp without one would be worse than not
 * attempting it. Instead, the signature this module's sibling services produce is stored
 * alongside the XML (Sale.digitalSignature, Sale.publicKeyPem) rather than fabricated into the
 * document itself.
 */

export interface UblInvoiceLine {
  id: number;
  descriptionEn: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
  taxCategoryCode: string; // S/Z/E/O
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
  // Only meaningful (and only ever set by the caller) when taxCategoryCode is E or Z - one of
  // ZATCA's fixed VATEX-SA-* codes plus its English reason text. See taxExemptionReasons.ts.
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

export interface UblInvoiceInput {
  invoiceId: string;
  uuid: string;
  icv: number;
  previousInvoiceHash: string;
  issueDateIso: string; // YYYY-MM-DD
  issueTimeIso: string; // HH:mm:ss
  invoiceTypeCode: "STANDARD" | "SIMPLIFIED";
  currency: string;
  seller: {
    nameEn: string;
    vatNumber: string;
    crNumber?: string | null;
    city?: string | null;
    address?: string | null;
    district?: string | null;
    postalCode?: string | null;
    buildingNo?: string | null;
  };
  buyer?: {
    name: string;
    vatNumber?: string | null;
  };
  lines: UblInvoiceLine[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  // Additional Expenses total (untaxed pass-through charges) - disclosed as its own
  // ChargeTotalAmount when non-zero. totalAmount already includes it (see pos.service.ts).
  chargeAmount?: string;
  // UNCL4461 payment-means code(s) actually used on the sale (see pos.service.ts's
  // resolvePaymentMeansCodes) - one cac:PaymentMeans per distinct code, e.g. split cash+card
  // tender emits two. Always at least one entry - "1" ("Instrument not defined") when unknown.
  paymentMeansCodes: string[];
}

/** 388 = Tax Invoice (UN/CEFACT code list 1001). Standard vs Simplified is conveyed via the
 *  cbc:InvoiceTypeCode's `name` attribute in ZATCA's profile, not a different code value. */
const INVOICE_TYPE_CODE = "388";

function money(el: XMLBuilder, tag: string, currency: string, value: string): XMLBuilder {
  return el.ele(tag).att("currencyID", currency).txt(value).up();
}

export function buildInvoiceXml(input: UblInvoiceInput): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("Invoice", {
    xmlns: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  });

  doc.ele("cbc:ProfileID").txt("reporting:1.0").up();
  doc.ele("cbc:ID").txt(input.invoiceId).up();
  doc.ele("cbc:UUID").txt(input.uuid).up();
  doc.ele("cbc:IssueDate").txt(input.issueDateIso).up();
  doc.ele("cbc:IssueTime").txt(input.issueTimeIso).up();
  doc
    .ele("cbc:InvoiceTypeCode")
    .att("name", input.invoiceTypeCode === "STANDARD" ? "0100000" : "0200000")
    .txt(INVOICE_TYPE_CODE)
    .up();
  doc.ele("cbc:DocumentCurrencyCode").txt(input.currency).up();
  doc.ele("cbc:TaxCurrencyCode").txt(input.currency).up();

  // ICV
  doc.ele("cac:AdditionalDocumentReference").ele("cbc:ID").txt("ICV").up().ele("cbc:UUID").txt(String(input.icv)).up().up();

  // PIH
  doc
    .ele("cac:AdditionalDocumentReference")
    .ele("cbc:ID")
    .txt("PIH")
    .up()
    .ele("cac:Attachment")
    .ele("cbc:EmbeddedDocumentBinaryObject")
    .att("mimeCode", "text/plain")
    .txt(input.previousInvoiceHash)
    .up()
    .up()
    .up();

  // Supplier
  const supplierParty = doc.ele("cac:AccountingSupplierParty").ele("cac:Party");
  if (input.seller.crNumber) {
    supplierParty.ele("cac:PartyIdentification").ele("cbc:ID").att("schemeID", "CRN").txt(input.seller.crNumber).up().up();
  }
  const supplierAddress = supplierParty.ele("cac:PostalAddress");
  if (input.seller.address) supplierAddress.ele("cbc:StreetName").txt(input.seller.address).up();
  if (input.seller.buildingNo) supplierAddress.ele("cbc:BuildingNumber").txt(input.seller.buildingNo).up();
  if (input.seller.district) supplierAddress.ele("cbc:CitySubdivisionName").txt(input.seller.district).up();
  supplierAddress.ele("cbc:CityName").txt(input.seller.city ?? "").up();
  if (input.seller.postalCode) supplierAddress.ele("cbc:PostalZone").txt(input.seller.postalCode).up();
  supplierAddress.ele("cac:Country").ele("cbc:IdentificationCode").txt("SA").up().up();
  supplierParty
    .ele("cac:PartyTaxScheme")
    .ele("cbc:CompanyID")
    .txt(input.seller.vatNumber)
    .up()
    .ele("cac:TaxScheme")
    .ele("cbc:ID")
    .txt("VAT")
    .up()
    .up()
    .up();
  supplierParty.ele("cac:PartyLegalEntity").ele("cbc:RegistrationName").txt(input.seller.nameEn).up().up();

  // Customer (present for both types; VAT number only when known/B2B)
  const customerParty = doc.ele("cac:AccountingCustomerParty").ele("cac:Party");
  if (input.buyer?.vatNumber) {
    customerParty
      .ele("cac:PartyTaxScheme")
      .ele("cbc:CompanyID")
      .txt(input.buyer.vatNumber)
      .up()
      .ele("cac:TaxScheme")
      .ele("cbc:ID")
      .txt("VAT")
      .up()
      .up()
      .up();
  }
  customerParty.ele("cac:PartyLegalEntity").ele("cbc:RegistrationName").txt(input.buyer?.name ?? "Walk-in Customer").up().up();

  // Payment means - one per distinct UNCL4461 code actually used on the sale (split tender
  // across e.g. cash+card emits two). Always at least one entry - see pos.service.ts's
  // resolvePaymentMeansCodes.
  for (const code of input.paymentMeansCodes) {
    doc.ele("cac:PaymentMeans").ele("cbc:PaymentMeansCode").txt(code).up().up();
  }

  // Invoice-level discount as a real cac:AllowanceCharge - ZATCA/UBL requires the sum of
  // AllowanceCharge amounts to equal LegalMonetaryTotal's AllowanceTotalAmount below; emitting
  // the total without at least one matching AllowanceCharge element is self-inconsistent and
  // gets rejected. Always emitted (amount "0.00" when there's no discount), matching the
  // reference implementation's own pattern. Tax category simplification: for an invoice whose
  // lines span more than one tax rate/category, this uses the FIRST line's category as the
  // charge's own tax category (a real invoice-level discount can't be split "correctly" across
  // categories without knowing which category it was meant to reduce - not attempted here).
  const primaryTaxCategory = input.lines[0];
  const allowanceCharge = doc.ele("cac:AllowanceCharge");
  allowanceCharge.ele("cbc:ChargeIndicator").txt("false").up();
  allowanceCharge.ele("cbc:AllowanceChargeReason").txt("Discount").up();
  money(allowanceCharge, "cbc:Amount", input.currency, input.discountAmount);
  if (primaryTaxCategory) {
    const chargeTaxCategory = allowanceCharge.ele("cac:TaxCategory");
    chargeTaxCategory.ele("cbc:ID").txt(primaryTaxCategory.taxCategoryCode).up();
    chargeTaxCategory.ele("cbc:Percent").txt(primaryTaxCategory.taxPercent).up();
    chargeTaxCategory.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT").up().up();
  }

  // Tax total (summary) - one cac:TaxSubtotal per distinct tax category+rate actually present on
  // the invoice (a mixed-rate cart, e.g. standard + zero-rated lines, needs one each; a single
  // blanket subtotal using only the invoice grand totals is what ZATCA's schematron rejects).
  //
  // Raw per-line subtotals/tax are priced BEFORE pos.service.ts's invoice-level discount/coupon/
  // points/shipping math (which nets against the blended total, not per line - see checkout()'s
  // own "reasonable approximation for a single-VAT-rate storefront" comment) - summing them
  // directly would produce a TaxSubtotal breakdown that doesn't add up to the invoice's own
  // authoritative TaxTotal/TaxExclusiveAmount, which is exactly the kind of internal
  // inconsistency ZATCA's schematron rejects. Each group is scaled down by the same ratio the
  // invoice-level subtotal was reduced by, then its tax is recomputed from ITS OWN category
  // percent against the scaled base - guaranteeing TaxableAmount * Percent / 100 == TaxAmount
  // holds per row (a separate schematron check) while the groups still sum to the invoice totals.
  const taxGroups = new Map<string, { categoryCode: string; percent: string; taxableAmount: number }>();
  let rawSubtotalSum = 0;
  for (const line of input.lines) {
    const key = `${line.taxCategoryCode}|${line.taxPercent}`;
    const lineSubtotal = Number(line.lineSubtotal);
    rawSubtotalSum += lineSubtotal;
    const existing = taxGroups.get(key);
    if (existing) existing.taxableAmount += lineSubtotal;
    else taxGroups.set(key, { categoryCode: line.taxCategoryCode, percent: line.taxPercent, taxableAmount: lineSubtotal });
  }
  const discountScaleFactor = rawSubtotalSum > 0 ? Number(input.subtotal) / rawSubtotalSum : 1;

  const taxTotal = doc.ele("cac:TaxTotal");
  money(taxTotal, "cbc:TaxAmount", input.currency, input.taxAmount);
  for (const group of taxGroups.values()) {
    const scaledTaxable = group.taxableAmount * discountScaleFactor;
    const scaledTax = (scaledTaxable * Number(group.percent)) / 100;
    const taxSubtotal = taxTotal.ele("cac:TaxSubtotal");
    money(taxSubtotal, "cbc:TaxableAmount", input.currency, scaledTaxable.toFixed(2));
    money(taxSubtotal, "cbc:TaxAmount", input.currency, scaledTax.toFixed(2));
    const subtotalCategory = taxSubtotal.ele("cac:TaxCategory");
    subtotalCategory.ele("cbc:ID").txt(group.categoryCode).up();
    subtotalCategory.ele("cbc:Percent").txt(group.percent).up();
    subtotalCategory.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT").up().up();
  }

  // Legal monetary total
  const monetaryTotal = doc.ele("cac:LegalMonetaryTotal");
  money(monetaryTotal, "cbc:LineExtensionAmount", input.currency, input.subtotal);
  money(monetaryTotal, "cbc:TaxExclusiveAmount", input.currency, input.subtotal);
  money(monetaryTotal, "cbc:TaxInclusiveAmount", input.currency, input.totalAmount);
  money(monetaryTotal, "cbc:AllowanceTotalAmount", input.currency, input.discountAmount);
  if (input.chargeAmount && input.chargeAmount !== "0.00" && input.chargeAmount !== "0") {
    money(monetaryTotal, "cbc:ChargeTotalAmount", input.currency, input.chargeAmount);
  }
  money(monetaryTotal, "cbc:PayableAmount", input.currency, input.totalAmount);

  // Lines
  for (const line of input.lines) {
    const lineEl = doc.ele("cac:InvoiceLine");
    lineEl.ele("cbc:ID").txt(String(line.id)).up();
    // Unit-of-measure code (UN/ECE Rec 20) - hardcoded to "PCE" (piece) for now, matching this
    // laundry system's actual catalog (garments/items counted, not sold by weight or volume).
    // Revisit with a real per-product unit-code mapping if that ever changes.
    lineEl.ele("cbc:InvoicedQuantity").att("unitCode", "PCE").txt(line.quantity).up();
    money(lineEl, "cbc:LineExtensionAmount", input.currency, line.lineSubtotal);

    const lineTax = lineEl.ele("cac:TaxTotal");
    money(lineTax, "cbc:TaxAmount", input.currency, line.lineTax);
    money(lineTax, "cbc:RoundingAmount", input.currency, line.lineTotal);

    const item = lineEl.ele("cac:Item");
    item.ele("cbc:Name").txt(line.descriptionEn).up();
    const taxCategory = item.ele("cac:ClassifiedTaxCategory");
    taxCategory.ele("cbc:ID").txt(line.taxCategoryCode).up();
    taxCategory.ele("cbc:Percent").txt(line.taxPercent).up();
    if (line.taxExemptionReasonCode) {
      taxCategory.ele("cbc:TaxExemptionReasonCode").txt(line.taxExemptionReasonCode).up();
      if (line.taxExemptionReason) taxCategory.ele("cbc:TaxExemptionReason").txt(line.taxExemptionReason).up();
    }
    taxCategory.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT").up().up();

    money(lineEl.ele("cac:Price"), "cbc:PriceAmount", input.currency, line.unitPrice);
  }

  return doc.end({ prettyPrint: false });
}
