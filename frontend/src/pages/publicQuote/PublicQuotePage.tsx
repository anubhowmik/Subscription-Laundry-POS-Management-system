import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import type { SaleDetail } from "../invoices/invoiceTypes";
import { StandardTemplate } from "../invoices/templates/StandardTemplate";
import { Thermal58Template } from "../invoices/templates/Thermal58Template";
import { Thermal80Template } from "../invoices/templates/Thermal80Template";
import { A4FullTemplate } from "../invoices/templates/A4FullTemplate";
import { A5Template } from "../invoices/templates/A5Template";
import { GarmentTagTemplate } from "../invoices/templates/GarmentTagTemplate";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/Spinner";

const TEMPLATE_COMPONENTS = {
  standard: StandardTemplate,
  thermal58: Thermal58Template,
  thermal80: Thermal80Template,
  a4Full: A4FullTemplate,
  a5: A5Template,
  garmentTag: GarmentTagTemplate,
};

/**
 * Reference's own public, unauthenticated `/quote/{token}` (SellPosController@showInvoice) -
 * anyone with the link can open this, no login. Deliberately outside every auth/permission
 * wrapper in App.tsx, matching "/" and "/login" (see backend's publicQuote.routes.ts, mounted
 * outside the auth/paywall gate too). Renders through the exact same draft-aware invoice
 * templates the authenticated /invoices/:saleId print preview uses - a shared quote link and a
 * logged-in print preview are the same document, just reached two different ways.
 */
export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";

  const { data: sale, isLoading, isError } = useQuery({
    queryKey: ["public-quote", token],
    queryFn: async () => (await api.get<ApiSuccess<SaleDetail>>(`/public/quotes/${token}`)).data.data,
    enabled: Boolean(token),
    retry: false,
  });

  if (isLoading) return <LoadingState label="Loading..." />;
  if (isError || !sale) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-sm text-slate-400">
        {isAr ? "هذا الرابط غير صالح أو انتهت صلاحيته." : "This link is invalid or has expired."}
      </div>
    );
  }

  const currency = sale.businessLocation.currency;
  const layout = sale.resolvedInvoiceLayout;
  const Template = TEMPLATE_COMPONENTS[layout?.templateKey ?? "standard"];

  return (
    <div>
      <div className="mx-auto flex max-w-3xl items-center justify-end p-6 pb-0 print:hidden">
        <Button onClick={() => window.print()}>{isAr ? "طباعة" : "Print"}</Button>
      </div>
      <Template sale={sale} layout={layout} qr={undefined} isAr={isAr} locale={locale} currency={currency} />
    </div>
  );
}
