import { useState } from "react";
import { useCurrentRegisterSession, useOpenRegister, useCloseRegister } from "../../api/posApi";
import { formatMoney } from "../../lib/format";

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
            className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
          >
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
            className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
          >
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
    <ModalShell title={isAr ? "فتح الصندوق" : "Open Register"} onClose={onClose}>
      <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ الافتتاحي" : "Opening cash amount"}</label>
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        autoFocus
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
      />
      <button
        onClick={() => onOpen(Number(amount || 0))}
        className="mt-3 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
      >
        {isAr ? "فتح" : "Open"}
      </button>
    </ModalShell>
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
    <ModalShell title={isAr ? "إغلاق الصندوق" : "Close Register"} onClose={onClose}>
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
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
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
          <input
            type="number"
            min={0}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </>
      )}

      <label className="mb-1 mt-3 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
      />
      <button
        onClick={() => {
          if (countByDenomination) {
            const denominations = Object.fromEntries(DENOMINATIONS.filter((d) => Number(counts[d] || 0) > 0).map((d) => [String(d), Number(counts[d])]));
            onCloseRegister(denominationTotal, notes || undefined, denominations);
          } else {
            onCloseRegister(Number(counted || 0), notes || undefined, undefined);
          }
        }}
        className="mt-3 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        {isAr ? "إغلاق" : "Close"}
      </button>
      <p className="mt-2 text-[11px] text-slate-400">
        {isAr ? "سيتم مقارنة المبلغ المتوقع (الافتتاحي + النقدي المحصّل) بما تم عدّه فعليًا." : "The expected amount (opening + cash collected) will be compared against what you counted."}
      </p>
    </ModalShell>
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
    <ModalShell title={isAr ? "نتيجة التسوية" : "Reconciliation"} onClose={onDismiss}>
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
      <button onClick={onDismiss} className="mt-3 w-full rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
        {isAr ? "حسنًا" : "OK"}
      </button>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
