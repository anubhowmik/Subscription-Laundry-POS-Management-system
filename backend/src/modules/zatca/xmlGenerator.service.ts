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
  supplierParty
    .ele("cac:PostalAddress")
    .ele("cbc:CityName")
    .txt(input.seller.city ?? "")
    .up()
    .ele("cac:Country")
    .ele("cbc:IdentificationCode")
    .txt("SA")
    .up()
    .up()
    .up();
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

  // Tax total (summary)
  const taxTotal = doc.ele("cac:TaxTotal");
  money(taxTotal, "cbc:TaxAmount", input.currency, input.taxAmount);

  // Legal monetary total
  const monetaryTotal = doc.ele("cac:LegalMonetaryTotal");
  money(monetaryTotal, "cbc:LineExtensionAmount", input.currency, input.subtotal);
  money(monetaryTotal, "cbc:TaxExclusiveAmount", input.currency, input.subtotal);
  money(monetaryTotal, "cbc:TaxInclusiveAmount", input.currency, input.totalAmount);
  money(monetaryTotal, "cbc:AllowanceTotalAmount", input.currency, input.discountAmount);
  money(monetaryTotal, "cbc:PayableAmount", input.currency, input.totalAmount);

  // Lines
  for (const line of input.lines) {
    const lineEl = doc.ele("cac:InvoiceLine");
    lineEl.ele("cbc:ID").txt(String(line.id)).up();
    lineEl.ele("cbc:InvoicedQuantity").txt(line.quantity).up();
    money(lineEl, "cbc:LineExtensionAmount", input.currency, line.lineSubtotal);

    const lineTax = lineEl.ele("cac:TaxTotal");
    money(lineTax, "cbc:TaxAmount", input.currency, line.lineTax);
    money(lineTax, "cbc:RoundingAmount", input.currency, line.lineTotal);

    const item = lineEl.ele("cac:Item");
    item.ele("cbc:Name").txt(line.descriptionEn).up();
    item
      .ele("cac:ClassifiedTaxCategory")
      .ele("cbc:ID")
      .txt(line.taxCategoryCode)
      .up()
      .ele("cbc:Percent")
      .txt(line.taxPercent)
      .up()
      .ele("cac:TaxScheme")
      .ele("cbc:ID")
      .txt("VAT")
      .up()
      .up()
      .up();

    money(lineEl.ele("cac:Price"), "cbc:PriceAmount", input.currency, line.unitPrice);
  }

  return doc.end({ prettyPrint: false });
}
