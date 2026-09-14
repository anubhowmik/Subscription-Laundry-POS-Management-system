import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { Paperclip } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { triggerDownload } from "../../lib/tableExport";
import type { SaleDetail, QrResponse } from "./invoiceTypes";
import { StandardTemplate } from "./templates/StandardTemplate";
import { Thermal58Template } from "./templates/Thermal58Template";
import { Thermal80Template } from "./templates/Thermal80Template";
import { A4FullTemplate } from "./templates/A4FullTemplate";
import { A5Template } from "./templates/A5Template";
import { GarmentTagTemplate } from "./templates/GarmentTagTemplate";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { BackButton } from "../../components/ui/BackButton";
import { LoadingState } from "../../components/ui/Spinner";

const TEMPLATE_COMPONENTS = {
  standard: StandardTemplate,
  thermal58: Thermal58Template,
  thermal80: Thermal80Template,
  a4Full: A4FullTemplate,
  a5: A5Template,
  garmentTag: GarmentTagTemplate,
};

export default function InvoicePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: sale, isLoading } = useQuery({
    queryKey: ["invoice", saleId],
    queryFn: async () => (await api.get<ApiSuccess<SaleDetail>>(`/sales/${saleId}`)).data.data,
    enabled: Boolean(saleId),
  });

  // A DRAFT quote/delivery never has real ZATCA QR data (see Sale.qrCodeBase64's schema comment -
  // it's null until confirmQuote()/checkout() finalizes the sale) - skip the fetch entirely rather
  // than rendering an empty/broken QR image for one. A bulk-imported historical sale (Import
  // Sales) is FINAL but deliberately never enters the icv/hash chain either (see
  // importSales.service.ts) - `icv` is the reliable "was this ever actually ZATCA-signed" check.
  const { data: qr } = useQuery({
    queryKey: ["invoice-qr", saleId],
    queryFn: async () => (await api.get<ApiSuccess<QrResponse>>(`/sales/${saleId}/qr`)).data.data,
    enabled: Boolean(saleId) && sale?.status === "FINAL" && sale?.icv != null,
  });

  const submitMutation = useMutation({
    mutationFn: async () => api.post(`/sales/${saleId}/submit-to-zatca`),
    onSuccess: () => {
      setSubmitError(null);
      queryClient.invalidateQueries({ queryKey: ["invoice", saleId] });
    },
    onError: (err) => {
      setSubmitError(isAxiosError(err) ? err.response?.data?.message ?? "Submission failed" : "Submission failed");
    },
  });

  if (isLoading || !sale) {
    return <LoadingState label="Loading..." />;
  }

  const canSubmit = Boolean(sale.digitalSignature) && !["CLEARED", "REPORTED"].includes(sale.clearanceStatus);
  const currency = sale.businessLocation.currency;
  const layout = sale.resolvedInvoiceLayout;
  const Template = TEMPLATE_COMPONENTS[layout?.templateKey ?? "standard"];
  const backTo = sale.status === "DRAFT" ? (sale.isQuotation ? "/quotes" : "/deliveries") : "/sales";

  return (
    <div>
      <div className="mx-auto flex max-w-3xl items-center justify-between p-6 pb-0 print:hidden">
        <BackButton to={backTo} label={isAr ? "العودة" : "Back"} />
        <div className="flex items-center gap-2">
          {sale.documentPath && (
            <Button
              variant="outline"
              onClick={async () => {
                const res = await api.get(`/sales/${saleId}/document`, { responseType: "blob" });
                triggerDownload(res.data as Blob, sale.documentOriginalName ?? "document");
              }}
            >
              <Paperclip className="me-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
              {isAr ? sale.documentOriginalName ?? "المستند المرفق" : sale.documentOriginalName ?? "Attached Document"}
            </Button>
          )}
          {canSubmit && (
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} variant="outline">
              {submitMutation.isPending ? "Submitting..." : "Submit to ZATCA"}
            </Button>
          )}
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>

      {submitError && (
        <Alert variant="danger" className="mx-auto mb-4 max-w-3xl print:hidden">
          {submitError}
        </Alert>
      )}

      <Template sale={sale} layout={layout} qr={qr} isAr={isAr} locale={locale} currency={currency} />
    </div>
  );
}
