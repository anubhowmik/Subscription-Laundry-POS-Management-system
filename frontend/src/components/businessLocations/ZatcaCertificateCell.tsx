import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { KeyRound } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import { Alert } from "../ui/Alert";
import { inputClass } from "../ui/formClasses";

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
      <Button
        variant="outline"
        size="sm"
        onClick={() => generateMutation.mutate()}
        disabled={!hasVatNumber || generateMutation.isPending}
        title={hasVatNumber ? "" : "Set the VAT number first"}
      >
        {generateMutation.isPending ? "Generating..." : "Generate CSR"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge
        variant={cert.status === "PRODUCTION_ISSUED" ? "success" : cert.status === "FAILED" ? "danger" : "info"}
        title={STATUS_LABEL[cert.status]}
        className="gap-1"
      >
        <KeyRound className="h-3 w-3" strokeWidth={2} aria-hidden />
        {cert.status}
      </Badge>
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
        <Modal
          title="Compliance CSID"
          subtitle="Enter the OTP from ZATCA's Fatoora portal for this business/unit."
          onClose={() => {
            setShowOtpModal(false);
            setError(null);
          }}
          size="sm"
        >
          <p className="mb-4 text-sm text-slate-500">
            This call has not been tested against a real ZATCA endpoint yet - if it fails, the error message below will
            show ZATCA's response (or a network error) so we know what to fix.
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="OTP"
            className={`${inputClass} ltr-nums`}
          />
          {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={() => {
                setShowOtpModal(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              fullWidth
              onClick={() => complianceMutation.mutate()}
              disabled={!otp || complianceMutation.isPending}
            >
              {complianceMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
