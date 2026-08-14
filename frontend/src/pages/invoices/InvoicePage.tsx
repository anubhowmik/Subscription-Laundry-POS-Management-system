import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import type { SaleDetail, QrResponse } from "./invoiceTypes";
import { StandardTemplate } from "./templates/StandardTemplate";
import { Thermal58Template } from "./templates/Thermal58Template";
import { Thermal80Template } from "./templates/Thermal80Template";
import { A4FullTemplate } from "./templates/A4FullTemplate";
import { A5Template } from "./templates/A5Template";
import { GarmentTagTemplate } from "./templates/GarmentTagTemplate";

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

  const { data: qr } = useQuery({
    queryKey: ["invoice-qr", saleId],
    queryFn: async () => (await api.get<ApiSuccess<QrResponse>>(`/sales/${saleId}/qr`)).data.data,
    enabled: Boolean(saleId),
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
    return <div className="p-8 text-center text-sm text-slate-500">Loading...</div>;
  }

  const canSubmit = Boolean(sale.digitalSignature) && !["CLEARED", "REPORTED"].includes(sale.clearanceStatus);
  const currency = sale.businessLocation.currency;
  const layout = sale.businessLocation.invoiceLayoutSettings;
  const Template = TEMPLATE_COMPONENTS[layout?.templateKey ?? "standard"];

  return (
    <div>
      <div className="mx-auto flex max-w-3xl items-center justify-between p-6 pb-0 print:hidden">
        <Link to="/sales" className="text-sm text-sky-700 hover:underline">
          &larr; Back
        </Link>
        <div className="flex items-center gap-2">
          {canSubmit && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit to ZATCA"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Print
          </button>
        </div>
      </div>

      {submitError && (
        <p className="mx-auto mb-4 max-w-3xl rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 print:hidden">{submitError}</p>
      )}

      <Template sale={sale} layout={layout} qr={qr} isAr={isAr} locale={locale} currency={currency} />
    </div>
  );
}
