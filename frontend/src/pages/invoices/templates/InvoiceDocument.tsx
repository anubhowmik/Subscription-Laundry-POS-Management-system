import { formatMoney, formatDate } from "../../../lib/format";
import { resolveLabel, isShown } from "../invoiceLabels";
import type { InvoiceTemplateProps } from "../invoiceTypes";

interface SizeConfig {
  containerClass: string; // max-width + padding for the outer wrapper
  bodyClass: string; // border/padding/text-size for the document itself
  qrSizeClass: string;
}

/**
 * Shared renderer for every "financial invoice" template variant (standard/thermal58/thermal80/
 * a4Full/a5) - they differ only in paper width/typography, not in which fields exist or how
 * toggles/label overrides are applied, so one component parameterized by `size` avoids
 * duplicating that logic 5 times. garmentTag is different enough (no financial breakdown at all)
 * to stay its own component - see GarmentTagTemplate.tsx.
 */
export function InvoiceDocument({ sale, layout, qr, isAr, locale, currency, size }: InvoiceTemplateProps & { size: SizeConfig }) {
  // A DRAFT quote/delivery is never ZATCA-signed and has no invoiceNumber yet - render its own
  // number/heading instead of the FINAL-sale Tax Invoice title (reference's own getReceiptDetails()
  // does the same is_quotation/status branch - see the reference-parity research this was built
  // from). A plain (non-quotation) DRAFT falls through to the invoice heading in the reference too,
  // but this app's Delivery is a distinct, laundry-specific concept (the intake/drop-off ticket)
  // that deserves its own label rather than silently reading "Tax Invoice" before it's even final.
  const isDraft = sale.status === "DRAFT";
  const invoiceTitleEn = isDraft ? (sale.isQuotation ? "Quotation" : "Delivery") : sale.invoiceTypeCode === "STANDARD" ? "Tax Invoice" : "Simplified Tax Invoice";
  const invoiceTitleAr = isDraft ? (sale.isQuotation ? "عرض سعر" : "إيصال تسليم") : sale.invoiceTypeCode === "STANDARD" ? "فاتورة ضريبية" : "فاتورة ضريبية مبسطة";
  const displayNumber = sale.invoiceNumber ?? (sale.isQuotation ? sale.quoteNumber : sale.deliveryNumber);
  const numberLabelEn = isDraft ? (sale.isQuotation ? "Quote No." : "Delivery No.") : null;
  const numberLabelAr = isDraft ? (sale.isQuotation ? "رقم العرض" : "رقم التسليم") : null;
  const label = (key: Parameters<typeof resolveLabel>[0]) => resolveLabel(key, isAr, layout);
  const show = (key: Parameters<typeof isShown>[0]) => isShown(key, layout);

  return (
    <div className={size.containerClass}>
      <div className={size.bodyClass}>
        <div className="mb-4 flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            {show("showLogo") && layout?.logoUrl && <img src={layout.logoUrl} alt="" className="mb-2 h-10 object-contain" />}
            <p className="text-lg font-bold">{sale.businessLocation.businessNameEn}</p>
            <p className="text-lg font-bold" dir="rtl">
              {sale.businessLocation.businessNameAr}
            </p>
            {show("showBranchName") && <p className="mt-1 text-xs text-slate-500">{sale.businessLocation.branchName}</p>}
            {show("showCity") && sale.businessLocation.city && <p className="text-xs text-slate-500">{sale.businessLocation.city}</p>}
          </div>
          {!isDraft && show("showQrCode") && qr?.qrImageDataUrl && <img src={qr.qrImageDataUrl} alt="Invoice QR code" className={size.qrSizeClass} />}
        </div>

        {(show("showVatNumber") || show("showCrNumber")) && (
          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {show("showVatNumber") && (
              <div>
                <p className="font-semibold">{label("vatNumberLabel")}</p>
                <p className="ltr-nums">{sale.businessLocation.vatNumber ?? "-"}</p>
              </div>
            )}
            {show("showCrNumber") && (
              <div>
                <p className="font-semibold">{label("crNumberLabel")}</p>
                <p className="ltr-nums">{sale.businessLocation.crNumber ?? "-"}</p>
              </div>
            )}
          </div>
        )}

        <div className="mb-4 text-center">
          <p className="text-base font-bold">{invoiceTitleEn}</p>
          <p className="text-base font-bold" dir="rtl">
            {invoiceTitleAr}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-slate-300 py-2 text-xs">
          <div>
            <span className="font-semibold">{isDraft ? (isAr ? numberLabelAr : numberLabelEn) : label("invoiceNoLabel")}: </span>
            <span className="ltr-nums">{displayNumber}</span>
          </div>
          <div>
            <span className="font-semibold">{label("dateLabel")}: </span>
            <span className="ltr-nums">{formatDate(sale.saleDate, locale)}</span>
          </div>
          {!isDraft && show("showInvoiceUuid") && (
            <div>
              <span className="font-semibold">{label("invoiceUuidLabel")}: </span>
              <span className="ltr-nums break-all">{sale.id}</span>
            </div>
          )}
          {!isDraft && show("showIcv") && (
            <div>
              <span className="font-semibold">{label("icvLabel")}: </span>
              <span className="ltr-nums">{sale.icv}</span>
            </div>
          )}
          <div className="col-span-2">
            <span className="font-semibold">{label("customerLabel")}: </span>
            {sale.customer.nameEn}
            {sale.customer.nameAr ? ` / ${sale.customer.nameAr}` : ""}
            {show("showCustomerPhone") && <> — <span className="ltr-nums">{sale.customer.phone}</span></>}
            {show("showCustomerVat") && sale.customer.vatNumber && <span className="ltr-nums"> — {label("vatNumberLabel")}: {sale.customer.vatNumber}</span>}
          </div>
          {show("showRegisterSession") && sale.registerSession && (
            <div className="col-span-2">
              <span className="font-semibold">{label("registerLabel")}: </span>
              <span className="ltr-nums">{formatDate(sale.registerSession.openedAt, locale)}</span> — {sale.registerSession.openedByUser.fullNameEn}
            </div>
          )}
        </div>

        <table className="mb-4 w-full text-xs">
          <thead>
            <tr className="border-b border-slate-300 text-start">
              <th className="py-1 text-start">{label("itemLabel")}</th>
              {show("showItemSku") && <th className="py-1 text-start">{label("skuLabel")}</th>}
              <th className="py-1 text-end">{label("qtyLabel")}</th>
              <th className="py-1 text-end">{label("unitPriceLabel")}</th>
              <th className="py-1 text-end">{label("vatColLabel")}</th>
              <th className="py-1 text-end">{label("totalColLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-1">
                  {item.descriptionEn}
                  {item.descriptionAr ? <span dir="rtl" className="block text-slate-500"> {item.descriptionAr}</span> : null}
                </td>
                {show("showItemSku") && (
                  <td className="py-1"><span className="ltr-nums text-slate-500">{item.product?.sku ?? item.service?.code ?? "-"}</span></td>
                )}
                <td className="py-1 text-end"><span className="ltr-nums">{item.quantity}</span></td>
                <td className="py-1 text-end"><span className="ltr-nums">{formatMoney(item.unitPrice, currency, locale)}</span></td>
                <td className="py-1 text-end"><span className="ltr-nums">{formatMoney(item.taxAmount, currency, locale)}</span></td>
                <td className="py-1 text-end"><span className="ltr-nums">{formatMoney(item.total, currency, locale)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ms-auto w-56 space-y-1 text-xs">
          <div className="flex justify-between">
            <span>{label("subtotalLabel")}</span>
            <span className="ltr-nums">{formatMoney(sale.subtotal, currency, locale)}</span>
          </div>
          {show("showDiscountLine") && (
            <div className="flex justify-between">
              <span>{label("discountLabel")}</span>
              <span className="ltr-nums">{formatMoney(sale.discountAmount, currency, locale)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>{label("taxLabel")}</span>
            <span className="ltr-nums">{formatMoney(sale.taxAmount, currency, locale)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold">
            <span>{label("totalLabel")}</span>
            <span className="ltr-nums">{formatMoney(sale.totalAmount, currency, locale)}</span>
          </div>
          {show("showPaidDue") && (
            <>
              <div className="flex justify-between">
                <span>{label("paidLabel")}</span>
                <span className="ltr-nums">{formatMoney(sale.paidAmount, currency, locale)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{label("dueLabel")}</span>
                <span className="ltr-nums">{formatMoney(sale.dueAmount, currency, locale)}</span>
              </div>
            </>
          )}
          {show("showEstimatedReady") && sale.estimatedReadyAt && (
            <div className="flex justify-between pt-1">
              <span>{label("estimatedReadyLabel")}</span>
              <span className="ltr-nums">{new Date(sale.estimatedReadyAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {!isDraft && show("showDigitalSignatureNote") && (
          <p className="mt-6 text-center text-[10px] text-slate-400">
            {sale.digitalSignature ? (
              <span className="text-green-600">✓ Digitally signed (ECDSA secp256k1)</span>
            ) : (
              <span>Hash-chained, not yet digitally signed - see docs/POS-ZATCA-PLAN.md</span>
            )}
            {" · ZATCA status: "}
            <span className={sale.clearanceStatus === "CLEARED" || sale.clearanceStatus === "REPORTED" ? "text-green-600" : sale.clearanceStatus === "FAILED" ? "text-red-500" : ""}>
              {sale.clearanceStatus}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
