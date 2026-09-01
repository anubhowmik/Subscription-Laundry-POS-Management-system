import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { usePosStore, usePosTotals } from "../../stores/posStore";
import { useCreateBnplSession, useBnplSessionStatus, useCaptureBnplSession, type BnplProvider, type BnplSession } from "../../api/bnplApi";
import { formatMoney } from "../../lib/format";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import type { PosPaymentMethod } from "../../api/posApi";

interface Props {
  isAr: boolean;
  currency: string;
  locale: string;
  businessLocationId: string;
  paymentMethods: PosPaymentMethod[];
  onClose: () => void;
  notify: (msg: string) => void;
}

const PROVIDER_CODE: Record<BnplProvider, string> = { TAMARA: "BNPL_TAMARA", TABBY: "BNPL_TABBY", MISPAY: "BNPL_MISPAY" };
const PROVIDER_LABEL: Record<BnplProvider, { en: string; ar: string }> = {
  TAMARA: { en: "Tamara", ar: "تمارا" },
  TABBY: { en: "Tabby", ar: "تابي" },
  MISPAY: { en: "MISPay", ar: "ميسباي" },
};

/**
 * BNPL is deliberately its own modal, not a PaymentModal tender button - it's an async multi-step
 * flow (create session -> customer approves on their phone -> capture) rather than a one-click
 * add. Capture is automatic: the moment the poll below observes APPROVED, it fires the capture
 * call with no cashier click (see bnpl.service.ts for why the two-phase lifecycle still exists
 * server-side even though the frontend never exposes a manual "Capture" button).
 */
export function BnplFlowModal({ isAr, currency, locale, businessLocationId, paymentMethods, onClose, notify }: Props) {
  const customer = usePosStore((s) => s.customer);
  const addPayment = usePosStore((s) => s.addPayment);
  const totals = usePosTotals();

  const [provider, setProvider] = useState<BnplProvider | null>(null);
  const [session, setSession] = useState<BnplSession | null>(null);
  const capturedRef = useRef(false);

  const createSession = useCreateBnplSession();
  const captureSession = useCaptureBnplSession();
  const { data: polled } = useBnplSessionStatus(session?.id ?? null, Boolean(session) && !capturedRef.current);

  const current = polled ?? session;

  useEffect(() => {
    if (!current || capturedRef.current) return;
    if (current.status !== "APPROVED") return;
    capturedRef.current = true;
    captureSession.mutate(current.id, {
      onSuccess: (captured) => {
        const method = paymentMethods.find((m) => m.code === PROVIDER_CODE[captured.provider]);
        if (!method) {
          notify(isAr ? "طريقة الدفع غير مُهيأة" : "Payment method not configured");
          return;
        }
        addPayment({
          paymentMethodId: method.id,
          label: isAr ? PROVIDER_LABEL[captured.provider].ar : PROVIDER_LABEL[captured.provider].en,
          amount: Number(captured.amount),
          referenceNumber: captured.id,
        });
        onClose();
      },
      onError: () => {
        capturedRef.current = false;
        notify(isAr ? "تعذّر تأكيد الدفع الآجل" : "Could not confirm the BNPL payment");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.status]);

  function pick(p: BnplProvider) {
    const method = paymentMethods.find((m) => m.code === PROVIDER_CODE[p]);
    if (!method) {
      notify(isAr ? "طريقة الدفع غير مُهيأة لهذا المزوّد" : "This provider's payment method is not configured");
      return;
    }
    if (!customer) return;
    setProvider(p);
    createSession.mutate(
      {
        businessLocationId,
        provider: p,
        amount: totals.due,
        customerId: customer.id,
        customerPhone: customer.phone,
      },
      {
        onSuccess: (created) => setSession(created),
        onError: (err) => {
          const msg = isAxiosError(err) && err.response?.data?.message ? err.response.data.message : isAr ? "تعذّر بدء جلسة الدفع الآجل" : "Could not start the BNPL session";
          notify(msg);
          setProvider(null);
        },
      },
    );
  }

  return (
    <Modal onClose={onClose} title={isAr ? "الدفع الآجل (BNPL)" : "Buy Now, Pay Later"} size="sm">
      {!provider && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            {isAr ? "اختر مزوّد الدفع الآجل" : "Choose a BNPL provider"} · <span className="ltr-nums font-semibold">{formatMoney(totals.due, currency, locale)}</span>
          </p>
          <div className="grid grid-cols-1 gap-2">
            {(Object.keys(PROVIDER_LABEL) as BnplProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => pick(p)}
                className="rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
              >
                {isAr ? PROVIDER_LABEL[p].ar : PROVIDER_LABEL[p].en}
              </button>
            ))}
          </div>
        </div>
      )}

      {provider && createSession.isPending && (
        <p className="py-8 text-center text-sm text-slate-500">{isAr ? "جارٍ إنشاء الجلسة…" : "Creating session…"}</p>
      )}

      {provider && session && current && (current.status === "CREATED" || current.status === "APPROVED") && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-slate-600">
            {isAr
              ? `بانتظار موافقة العميل عبر ${isAr ? PROVIDER_LABEL[provider].ar : PROVIDER_LABEL[provider].en}…`
              : `Waiting for the customer to approve with ${PROVIDER_LABEL[provider].en}…`}
          </p>
          {current.checkoutUrl && (
            <a href={current.checkoutUrl} target="_blank" rel="noreferrer" className="block break-all text-xs text-violet-600 underline">
              {current.checkoutUrl}
            </a>
          )}
          <div className="flex items-center justify-center gap-2 py-4">
            <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
            <span className="text-xs text-slate-400">{isAr ? "جارٍ التحقق من الحالة…" : "Checking status…"}</span>
          </div>
        </div>
      )}

      {current && (current.status === "FAILED" || current.status === "CANCELLED" || current.status === "EXPIRED") && (
        <Alert variant="danger">
          {isAr ? "تعذّرت عملية الدفع الآجل. حاول مرة أخرى." : "The BNPL session did not complete. Please try again."}
        </Alert>
      )}

      {provider && (
        <Button variant="outline" fullWidth className="mt-4" onClick={onClose}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
      )}
    </Modal>
  );
}
