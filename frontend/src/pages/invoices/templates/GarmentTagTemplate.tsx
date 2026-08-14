import { resolveLabel, isShown } from "../invoiceLabels";
import type { InvoiceTemplateProps } from "../invoiceTypes";

/**
 * A small tag meant to be pinned to a garment while it's being processed - not a financial
 * document, so it deliberately skips the subtotal/discount/tax/paid/due breakdown the other 5
 * templates all share via InvoiceDocument. Large fonts, minimal fields: what it is, whose it is,
 * and when it'll be ready.
 */
export function GarmentTagTemplate({ sale, layout, qr, isAr, locale }: InvoiceTemplateProps) {
  const label = (key: Parameters<typeof resolveLabel>[0]) => resolveLabel(key, isAr, layout);
  const show = (key: Parameters<typeof isShown>[0]) => isShown(key, layout);

  return (
    <div className="mx-auto min-h-screen w-[260px] bg-white p-3 text-slate-900 print:p-0">
      <div className="border-2 border-dashed border-slate-400 p-3 text-center">
        {show("showBranchName") && <p className="text-xs font-semibold text-slate-500">{sale.businessLocation.branchName}</p>}
        <p className="mt-1 text-lg font-bold ltr-nums">{sale.invoiceNumber}</p>

        <div className="my-2 border-t border-dashed border-slate-300" />

        <p className="text-sm font-semibold">{sale.customer.nameEn}</p>
        {sale.customer.nameAr && (
          <p className="text-sm font-semibold" dir="rtl">
            {sale.customer.nameAr}
          </p>
        )}
        {show("showCustomerPhone") && <p className="mt-1 text-xs text-slate-500 ltr-nums">{sale.customer.phone}</p>}

        <div className="my-2 border-t border-dashed border-slate-300" />

        <div className="space-y-1 text-start">
          {sale.items.map((item) => (
            <div key={item.id} className="text-sm">
              <span className="font-semibold">{item.descriptionEn}</span>
              <span className="ms-1 ltr-nums text-slate-500">× {item.quantity}</span>
            </div>
          ))}
        </div>

        {show("showEstimatedReady") && sale.estimatedReadyAt && (
          <>
            <div className="my-2 border-t border-dashed border-slate-300" />
            <p className="text-xs text-slate-500">{label("estimatedReadyLabel")}</p>
            <p className="text-base font-bold ltr-nums">{new Date(sale.estimatedReadyAt).toLocaleString(locale)}</p>
          </>
        )}

        {show("showQrCode") && qr?.qrImageDataUrl && (
          <div className="mt-2 flex justify-center">
            <img src={qr.qrImageDataUrl} alt="Invoice QR code" className="h-20 w-20" />
          </div>
        )}
      </div>
    </div>
  );
}
