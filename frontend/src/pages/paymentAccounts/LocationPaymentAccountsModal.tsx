import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { LoadingState } from "../../components/ui/Spinner";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage, usePaymentAccountOptions } from "./shared";

interface MethodDefault {
  paymentMethodId: string;
  code: string;
  nameEn: string;
  nameAr: string;
  paymentAccountId: string | null;
}

/** Reference's Business Location "Payment Options" (default_payment_accounts): which payment account
 * each payment method at this branch lands in. A payment recorded at checkout/pay-due/refund is
 * credited (or, for a refund, debited) to this account automatically. */
export function LocationPaymentAccountsModal({ location, isAr, onClose }: { location: { id: string; branchName: string }; isAr: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts } = usePaymentAccountOptions();
  const { data: defaults, isLoading } = useQuery({
    queryKey: ["payment-accounts", "location-defaults", location.id],
    queryFn: async () => (await api.get<ApiSuccess<MethodDefault[]>>(`/payment-accounts/location-defaults/${location.id}`)).data.data,
  });
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaults) setSelection(Object.fromEntries(defaults.map((d) => [d.paymentMethodId, d.paymentAccountId ?? ""])));
  }, [defaults]);

  const mutation = useMutation({
    mutationFn: async () =>
      api.put(`/payment-accounts/location-defaults/${location.id}`, {
        items: (defaults ?? []).map((d) => ({ paymentMethodId: d.paymentMethodId, paymentAccountId: selection[d.paymentMethodId] || null })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-accounts"] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, isAr)),
  });

  return (
    <Modal
      title={`${isAr ? "خيارات الدفع" : "Payment Options"} — ${location.branchName}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={() => mutation.mutate()} disabled={!defaults || mutation.isPending}>
            {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <LoadingState label={isAr ? "جارٍ التحميل..." : "Loading..."} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{isAr ? "طريقة الدفع" : "Payment Method"}</th>
                  <th className="px-3 py-2 text-start">{isAr ? "الحساب الافتراضي" : "Default Account"}</th>
                </tr>
              </thead>
              <tbody>
                {(defaults ?? []).map((d) => (
                  <tr key={d.paymentMethodId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-700">{isAr ? d.nameAr || d.nameEn : d.nameEn}</td>
                    <td className="px-3 py-2">
                      <select
                        value={selection[d.paymentMethodId] ?? ""}
                        onChange={(e) => setSelection((prev) => ({ ...prev, [d.paymentMethodId]: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="">{isAr ? "لا يوجد" : "None"}</option>
                        {(accounts ?? []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
