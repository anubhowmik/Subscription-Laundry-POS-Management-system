import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

interface CertStatus {
  id: string;
  status: "KEY_GENERATED" | "COMPLIANCE_ISSUED" | "PRODUCTION_ISSUED" | "FAILED";
  lastError?: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<CertStatus["status"], string> = {
  KEY_GENERATED: "Key generated (not yet submitted to ZATCA)",
  COMPLIANCE_ISSUED: "Compliance CSID issued",
  PRODUCTION_ISSUED: "Production CSID issued - ready to submit invoices",
  FAILED: "Last ZATCA call failed",
};

export function ZatcaCertificateCell({ locationId, hasVatNumber }: { locationId: string; hasVatNumber: boolean }) {
  const queryClient = useQueryClient();
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: cert, isLoading } = useQuery({
    queryKey: ["zatca-cert-status", locationId],
    queryFn: async () => {
      try {
        const res = await api.get<ApiSuccess<CertStatus>>(`/zatca/certificates/${locationId}/status`);
        return res.data.data;
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["zatca-cert-status", locationId] });
  }

  function extractError(err: unknown) {
    return isAxiosError(err) ? err.response?.data?.message ?? "Request failed" : "Request failed";
  }

  const generateMutation = useMutation({
    mutationFn: async () => api.post(`/zatca/certificates/${locationId}/generate`),
    onSuccess: invalidate,
  });

  const complianceMutation = useMutation({
    mutationFn: async () => api.post(`/zatca/certificates/${locationId}/compliance-csid`, { otp }),
    onSuccess: () => {
      invalidate();
      setShowOtpModal(false);
      setOtp("");
      setError(null);
    },
    onError: (err) => setError(extractError(err)),
  });

  const productionMutation = useMutation({
    mutationFn: async () => api.post(`/zatca/certificates/${locationId}/production-csid`),
    onSuccess: invalidate,
    onError: (err) => setError(extractError(err)),
  });

  if (isLoading) return <span className="text-xs text-slate-400">...</span>;

  if (!cert) {
    return (
      <button
        onClick={() => generateMutation.mutate()}
        disabled={!hasVatNumber || generateMutation.isPending}
        title={hasVatNumber ? "" : "Set the VAT number first"}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {generateMutation.isPending ? "Generating..." : "Generate CSR"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
          cert.status === "PRODUCTION_ISSUED" ? "bg-green-100 text-green-700" : cert.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
        }`}
        title={STATUS_LABEL[cert.status]}
      >
        🔑 {cert.status}
      </span>
      {cert.lastError && <span className="max-w-xs text-[10px] text-red-500">{cert.lastError}</span>}

      {cert.status === "KEY_GENERATED" && (
        <button onClick={() => setShowOtpModal(true)} className="text-[10px] font-medium text-sky-700 hover:underline">
          Get Compliance CSID
        </button>
      )}
      {cert.status === "COMPLIANCE_ISSUED" && (
        <button
          onClick={() => productionMutation.mutate()}
          disabled={productionMutation.isPending}
          className="text-[10px] font-medium text-sky-700 hover:underline disabled:opacity-40"
        >
          {productionMutation.isPending ? "Requesting..." : "Get Production CSID"}
        </button>
      )}

      {showOtpModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-800">Compliance CSID</h2>
            <p className="mb-4 text-sm text-slate-500">
              Enter the OTP from ZATCA's Fatoora portal for this business/unit. This call has not been tested against a
              real ZATCA endpoint yet - if it fails, the error message below will show ZATCA's response (or a network
              error) so we know what to fix.
            </p>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm ltr-nums"
            />
            {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowOtpModal(false);
                  setError(null);
                }}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => complianceMutation.mutate()}
                disabled={!otp || complianceMutation.isPending}
                className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {complianceMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
