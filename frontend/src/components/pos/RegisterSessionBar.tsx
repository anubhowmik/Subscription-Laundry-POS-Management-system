import { useState } from "react";
import { Wallet, Lock } from "lucide-react";
import { useCurrentRegisterSession, useOpenRegister, useCloseRegister } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { inputClass, textareaClass, inputSmClass } from "../../components/ui/formClasses";

interface Props {
  businessLocationId: string;
  currency: string;
  locale: string;
  isAr: boolean;
  notify: (msg: string) => void;
}

/**
 * Cash-drawer session status bar. Opening/closing is entirely optional - the POS works normally
 * with no register open. When one is open, checkout automatically attributes sales to it so
 * this bar's close-out reconciliation (expected vs counted cash) has something to compare.
 */
export function RegisterSessionBar({ businessLocationId, currency, locale, isAr, notify }: Props) {
  const { data: session, isLoading } = useCurrentRegisterSession(businessLocationId);
  const openRegister = useOpenRegister();
  const closeRegister = useCloseRegister();
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [lastClosed, setLastClosed] = useState<{ expected: string; counted: string; diff: string } | null>(null);

  if (isLoading) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm">
      {session ? (
        <>
          <span className="flex items-center gap-2 text-slate-600">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {isAr ? "الصندوق مفتوح" : "Register open"}
            <span className="ltr-nums text-xs text-slate-400">
              · {isAr ? "الافتتاحي" : "Opening"} {formatMoney(session.openingCashAmount, currency, locale)}
            </span>
          </span>
          <button
            onClick={() => setCloseModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {isAr ? "إغلاق الصندوق" : "Close Register"}
          </button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-2 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            {isAr ? "لا يوجد صندوق مفتوح" : "No register open"}
          </span>
          <button
            onClick={() => setOpenModalOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            <Wallet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {isAr ? "فتح الصندوق" : "Open Register"}
          </button>
        </>
      )}

      {openModalOpen && (
        <OpenModal
          isAr={isAr}
          onClose={() => setOpenModalOpen(false)}
          onOpen={async (amount) => {
            try {
              await openRegister.mutateAsync({ businessLocationId, openingCashAmount: amount });
              setOpenModalOpen(false);
              notify(isAr ? "تم فتح الصندوق" : "Register opened");
            } catch {
              notify(isAr ? "تعذّر فتح الصندوق" : "Could not open the register");
            }
          }}
        />
      )}

      {closeModalOpen && session && (
        <CloseModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          onClose={() => setCloseModalOpen(false)}
          onCloseRegister={async (counted, notes, denominations) => {
            try {
              const closed = await closeRegister.mutateAsync({ id: session.id, countedCashAmount: counted, notes, denominations });
              setLastClosed({
                expected: closed.expectedCashAmount ?? "0",
                counted: closed.countedCashAmount ?? "0",
                diff: closed.cashDifference ?? "0",
              });
              setCloseModalOpen(false);
              notify(isAr ? "تم إغلاق الصندوق" : "Register closed");
            } catch {
              notify(isAr ? "تعذّر إغلاق الصندوق" : "Could not close the register");
            }
          }}
        />
      )}

      {lastClosed && (
        <ReconciliationResult isAr={isAr} currency={currency} locale={locale} result={lastClosed} onDismiss={() => setLastClosed(null)} />
      )}
    </div>
  );
}

function OpenModal({ isAr, onClose, onOpen }: { isAr: boolean; onClose: () => void; onOpen: (amount: number) => void }) {
  const [amount, setAmount] = useState("");
  return (
    <Modal title={isAr ? "فتح الصندوق" : "Open Register"} onClose={onClose} size="sm">
      <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ الافتتاحي" : "Opening cash amount"}</label>
      <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className={inputClass} />
      <Button onClick={() => onOpen(Number(amount || 0))} className="mt-3" fullWidth>
        {isAr ? "فتح" : "Open"}
      </Button>
    </Modal>
  );
}

// SAR denominations in circulation - notes then coins, largest to smallest.
const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05];

function CloseModal({
  isAr,
  currency,
  locale,
  onClose,
  onCloseRegister,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onCloseRegister: (counted: number, notes: string | undefined, denominations: Record<string, number> | undefined) => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [countByDenomination, setCountByDenomination] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const denominationTotal = DENOMINATIONS.reduce((sum, d) => sum + d * Number(counts[d] || 0), 0);

  return (
    <Modal title={isAr ? "إغلاق الصندوق" : "Close Register"} onClose={onClose} size="sm">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input type="checkbox" checked={countByDenomination} onChange={(e) => setCountByDenomination(e.target.checked)} />
        {isAr ? "العد حسب الفئات النقدية" : "Count by denomination"}
      </label>

      {countByDenomination ? (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {DENOMINATIONS.map((d) => (
            <div key={d} className="flex items-center justify-between gap-2">
              <span className="ltr-nums w-16 text-xs text-slate-600">{formatMoney(d, currency, locale)}</span>
              <span className="text-slate-400">×</span>
              <input
                type="number"
                min={0}
                value={counts[d] ?? ""}
                onChange={(e) => setCounts((prev) => ({ ...prev, [d]: e.target.value }))}
                className={`${inputSmClass} w-20`}
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-sm font-semibold">
            <span>{isAr ? "الإجمالي" : "Total"}</span>
            <span className="ltr-nums">{formatMoney(denominationTotal, currency, locale)}</span>
          </div>
        </div>
      ) : (
        <>
          <label className="mb-1 mt-3 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المعدود فعليًا" : "Counted cash amount"}</label>
          <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus className={inputClass} />
        </>
      )}

      <label className="mb-1 mt-3 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</label>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={textareaClass} />
      <Button
        onClick={() => {
          if (countByDenomination) {
            const denominations = Object.fromEntries(DENOMINATIONS.filter((d) => Number(counts[d] || 0) > 0).map((d) => [String(d), Number(counts[d])]));
            onCloseRegister(denominationTotal, notes || undefined, denominations);
          } else {
            onCloseRegister(Number(counted || 0), notes || undefined, undefined);
          }
        }}
        variant="danger"
        className="mt-3"
        fullWidth
      >
        {isAr ? "إغلاق" : "Close"}
      </Button>
      <p className="mt-2 text-[11px] text-slate-400">
        {isAr ? "سيتم مقارنة المبلغ المتوقع (الافتتاحي + النقدي المحصّل) بما تم عدّه فعليًا." : "The expected amount (opening + cash collected) will be compared against what you counted."}
      </p>
    </Modal>
  );
}

function ReconciliationResult({
  isAr,
  currency,
  locale,
  result,
  onDismiss,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  result: { expected: string; counted: string; diff: string };
  onDismiss: () => void;
}) {
  const diff = Number(result.diff);
  return (
    <Modal title={isAr ? "نتيجة التسوية" : "Reconciliation"} onClose={onDismiss} size="sm">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">{isAr ? "المتوقع" : "Expected"}</span>
          <span className="ltr-nums font-medium">{formatMoney(result.expected, currency, locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">{isAr ? "المعدود" : "Counted"}</span>
          <span className="ltr-nums font-medium">{formatMoney(result.counted, currency, locale)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-1">
          <span className="text-slate-500">{isAr ? "الفرق" : "Difference"}</span>
          <span className={`ltr-nums font-semibold ${diff === 0 ? "text-green-600" : diff > 0 ? "text-sky-600" : "text-red-600"}`}>
            {formatMoney(result.diff, currency, locale)}
          </span>
        </div>
      </div>
      <Button onClick={onDismiss} variant="secondary" className="mt-3" fullWidth>
        {isAr ? "حسنًا" : "OK"}
      </Button>
    </Modal>
  );
}
