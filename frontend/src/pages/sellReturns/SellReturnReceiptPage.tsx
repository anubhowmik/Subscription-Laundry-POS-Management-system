import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { Button } from "../../components/ui/Button";
import { BackButton } from "../../components/ui/BackButton";
import { LoadingState } from "../../components/ui/Spinner";

interface SellReturnReceipt {
  id: string;
  creditNoteNumber: string | null;
  returnDate: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  notes: string | null;
  sale: { invoiceNumber: string };
  customer: { nameEn: string; nameAr: string | null; phone: string };
  businessLocation: { branchName: string; businessNameEn: string; businessNameAr: string | null; vatNumber: string | null; crNumber: string | null; city: string | null; currency: string };
  items: { id: string; quantity: string; unitPrice: string; taxAmount: string; total: string; saleItem: { descriptionEn: string; descriptionAr: string | null } }[];
}

/** Reference's own single, fixed `sell_return.receipt` blade template - unlike a Sale invoice, a
 * return/credit-note in the reference never goes through the multi-template invoice-layout system
 * (StandardTemplate/Thermal58/.../GarmentTag), so this is deliberately one simple document rather
 * than another layout variant. */
export default function SellReturnReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";

  const { data, isLoading } = useQuery({
    queryKey: ["sell-return-receipt", id],
    queryFn: async () => (await api.get<ApiSuccess<SellReturnReceipt>>(`/sell-returns/${id}`)).data.data,
    enabled: Boolean(id),
  });

  if (isLoading || !data) return <LoadingState label="Loading..." />;

  const currency = data.businessLocation.currency;

  return (
    <div>
      <div className="mx-auto flex max-w-2xl items-center justify-between p-6 pb-0 print:hidden">
        <BackButton to="/sell-returns" label={isAr ? "العودة" : "Back"} />
        <Button onClick={() => window.print()}>{isAr ? "طباعة" : "Print"}</Button>
      </div>

      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-slate-300 p-6 text-sm">
          <div className="mb-4 border-b border-slate-300 pb-4">
            <p className="text-lg font-bold">{data.businessLocation.businessNameEn}</p>
            {data.businessLocation.businessNameAr && (
              <p className="text-lg font-bold" dir="rtl">
                {data.businessLocation.businessNameAr}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">{data.businessLocation.branchName}</p>
            {data.businessLocation.city && <p className="text-xs text-slate-500">{data.businessLocation.city}</p>}
          </div>

          {(data.businessLocation.vatNumber || data.businessLocation.crNumber) && (
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {data.businessLocation.vatNumber && (
                <div>
                  <p className="font-semibold">{isAr ? "الرقم الضريبي" : "VAT Number"}</p>
                  <p className="ltr-nums">{data.businessLocation.vatNumber}</p>
                </div>
              )}
              {data.businessLocation.crNumber && (
                <div>
                  <p className="font-semibold">{isAr ? "السجل التجاري" : "CR Number"}</p>
                  <p className="ltr-nums">{data.businessLocation.crNumber}</p>
                </div>
              )}
            </div>
          )}

          <div className="mb-4 text-center">
            <p className="text-base font-bold">{isAr ? "إشعار دائن" : "Credit Note"}</p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-slate-300 py-2 text-xs">
            <div>
              <span className="font-semibold">{isAr ? "رقم الإشعار" : "Credit Note No."}: </span>
              <span className="ltr-nums">{data.creditNoteNumber ?? "-"}</span>
            </div>
            <div>
              <span className="font-semibold">{isAr ? "التاريخ" : "Date"}: </span>
              <span className="ltr-nums">{formatDate(data.returnDate, locale)}</span>
            </div>
            <div>
              <span className="font-semibold">{isAr ? "الفاتورة الأصلية" : "Original Invoice"}: </span>
              <span className="ltr-nums">{data.sale.invoiceNumber}</span>
            </div>
            <div className="col-span-2">
              <span className="font-semibold">{isAr ? "العميل" : "Customer"}: </span>
              {data.customer.nameEn}
              {data.customer.nameAr ? ` / ${data.customer.nameAr}` : ""} — <span className="ltr-nums">{data.customer.phone}</span>
            </div>
          </div>

          <table className="mb-4 w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-start">
                <th className="py-1 text-start">{isAr ? "الصنف" : "Item"}</th>
                <th className="py-1 text-end">{isAr ? "الكمية" : "Qty"}</th>
                <th className="py-1 text-end">{isAr ? "السعر" : "Unit Price"}</th>
                <th className="py-1 text-end">{isAr ? "الضريبة" : "VAT"}</th>
                <th className="py-1 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-1">
                    {item.saleItem.descriptionEn}
                    {item.saleItem.descriptionAr ? (
                      <span dir="rtl" className="block text-slate-500">
                        {item.saleItem.descriptionAr}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 text-end">
                    <span className="ltr-nums">{item.quantity}</span>
                  </td>
                  <td className="py-1 text-end">
                    <span className="ltr-nums">{formatMoney(item.unitPrice, currency, locale)}</span>
                  </td>
                  <td className="py-1 text-end">
                    <span className="ltr-nums">{formatMoney(item.taxAmount, currency, locale)}</span>
                  </td>
                  <td className="py-1 text-end">
                    <span className="ltr-nums">{formatMoney(item.total, currency, locale)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ms-auto w-56 space-y-1 text-xs">
            <div className="flex justify-between">
              <span>{isAr ? "الإجمالي الفرعي" : "Subtotal"}</span>
              <span className="ltr-nums">{formatMoney(data.subtotal, currency, locale)}</span>
            </div>
            {Number(data.discountAmount) > 0 && (
              <div className="flex justify-between">
                <span>{isAr ? "الخصم" : "Discount"}</span>
                <span className="ltr-nums">-{formatMoney(data.discountAmount, currency, locale)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{isAr ? "الضريبة" : "VAT"}</span>
              <span className="ltr-nums">{formatMoney(data.taxAmount, currency, locale)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold">
              <span>{isAr ? "الإجمالي" : "Total"}</span>
              <span className="ltr-nums">{formatMoney(data.totalAmount, currency, locale)}</span>
            </div>
            <div className="flex justify-between">
              <span>{isAr ? "المسترد" : "Refunded"}</span>
              <span className="ltr-nums">{formatMoney(data.refundedAmount, currency, locale)}</span>
            </div>
          </div>

          {data.notes && <p className="mt-4 text-[11px] text-slate-500">{data.notes}</p>}
        </div>
      </div>
    </div>
  );
}
