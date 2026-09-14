import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calculator, Keyboard, Megaphone, MessageSquare, Wallet, CalendarCheck, Undo2, HandCoins, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

interface Props {
  isAr: boolean;
}

/**
 * Reference's own icon-heavy POS top bar (`layouts/partials/header-pos.blade.php`) - converted to
 * the icon buttons this app can genuinely back with a real destination: Calculator and Keyboard
 * Shortcuts are self-contained popovers (new, no backend needed); Announcements/Messages/Add
 * Expense/Bookings/Return Transaction/Compensations quick-jump to this app's own existing full
 * pages for that feature (same "navigate away, cart stays intact" pattern the "Recent" button
 * already used) rather than duplicating each as a second, POS-embedded copy. Deliberately NOT
 * converted here: Ready Sales / Rewash (this app's own laundry-workflow build, still queued as a
 * separate priority group) and Kitchen/Modifiers/Repair (tied to restaurant/repair verticals this
 * app doesn't have).
 */
export function PosHeaderBar({ isAr }: Props) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [calcOpen, setCalcOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const iconBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <button type="button" onClick={() => setCalcOpen((v) => !v)} title={isAr ? "الآلة الحاسبة" : "Calculator"} className={`${iconBtn} text-emerald-600`}>
          <Calculator className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        {calcOpen && <CalculatorPopover onClose={() => setCalcOpen(false)} />}
      </div>

      <div className="relative">
        <button type="button" onClick={() => setShortcutsOpen((v) => !v)} title={isAr ? "اختصارات لوحة المفاتيح" : "Keyboard Shortcuts"} className={`${iconBtn} text-slate-600`}>
          <Keyboard className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
        {shortcutsOpen && <ShortcutsPopover isAr={isAr} onClose={() => setShortcutsOpen(false)} />}
      </div>

      {can("announcements.manage") && (
        <button type="button" onClick={() => navigate("/announcements")} title={isAr ? "الإعلانات" : "Announcements"} className={`${iconBtn} text-amber-600`}>
          <Megaphone className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {can("messages.manage") && (
        <button type="button" onClick={() => navigate("/messages")} title={isAr ? "الرسائل" : "Messages"} className={`${iconBtn} text-sky-600`}>
          <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {can("expenses.view") && (
        <button type="button" onClick={() => navigate("/expenses")} title={isAr ? "إضافة مصروف" : "Add Expense"} className={`${iconBtn} text-indigo-600`}>
          <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {can("bookings.manage") && (
        <button type="button" onClick={() => navigate("/bookings")} title={isAr ? "الحجوزات" : "Bookings"} className={`${iconBtn} text-blue-600`}>
          <CalendarCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {can("sales.return") && (
        <button type="button" onClick={() => navigate("/sell-returns")} title={isAr ? "مرتجع بيع" : "Return Transaction"} className={`${iconBtn} text-red-600`}>
          <Undo2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}

      {can("compensations.file", "compensations.approve", "compensations.pay", "compensations.view_own", "compensations.view_all") && (
        <button type="button" onClick={() => navigate("/compensations")} title={isAr ? "التعويضات" : "Compensations"} className={`${iconBtn} text-teal-600`}>
          <HandCoins className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

function CalculatorPopover({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [pending, setPending] = useState<{ value: number; op: "+" | "-" | "×" | "÷" } | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);

  function inputDigit(d: string) {
    setDisplay((prev) => (prev === "0" || justEvaluated ? d : prev + d));
    setJustEvaluated(false);
  }
  function inputDecimal() {
    setDisplay((prev) => (justEvaluated ? "0." : prev.includes(".") ? prev : prev + "."));
    setJustEvaluated(false);
  }
  function applyOp(op: "+" | "-" | "×" | "÷") {
    const current = Number(display);
    if (pending) {
      setDisplay(String(compute(pending.value, current, pending.op)));
    }
    setPending({ value: pending ? compute(pending.value, current, pending.op) : current, op });
    setJustEvaluated(true);
  }
  function compute(a: number, b: number, op: "+" | "-" | "×" | "÷") {
    if (op === "+") return a + b;
    if (op === "-") return a - b;
    if (op === "×") return a * b;
    return b === 0 ? 0 : a / b;
  }
  function evaluate() {
    if (!pending) return;
    setDisplay(String(compute(pending.value, Number(display), pending.op)));
    setPending(null);
    setJustEvaluated(true);
  }
  function clear() {
    setDisplay("0");
    setPending(null);
    setJustEvaluated(false);
  }

  const keys: (string | { label: string; op: "+" | "-" | "×" | "÷" })[] = [
    "7", "8", "9", { label: "÷", op: "÷" },
    "4", "5", "6", { label: "×", op: "×" },
    "1", "2", "3", { label: "−", op: "-" },
    "0", ".", "C", { label: "+", op: "+" },
  ];

  return (
    <div className="absolute start-0 top-full z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <div className="ltr-nums flex-1 truncate rounded-lg bg-slate-50 px-2 py-1.5 text-end text-lg font-semibold text-slate-800">{display}</div>
        <button onClick={onClose} className="ms-1 text-slate-400 hover:text-red-500" aria-label="close">
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {keys.map((k, i) =>
          typeof k === "string" ? (
            <button
              key={i}
              onClick={() => (k === "C" ? clear() : k === "." ? inputDecimal() : inputDigit(k))}
              className={`ltr-nums rounded-lg py-2 text-sm font-medium transition-colors ${k === "C" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
            >
              {k}
            </button>
          ) : (
            <button key={i} onClick={() => applyOp(k.op)} className="rounded-lg bg-sky-50 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-100">
              {k.label}
            </button>
          ),
        )}
        <button onClick={evaluate} className="col-span-4 mt-1 rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          =
        </button>
      </div>
    </div>
  );
}

// This app's own real keyboard shortcuts (see PosPage.tsx's "Keyboard shortcuts" useEffect) -
// documenting THIS app's actual bindings, not the reference's own (different) key choices.
const SHORTCUTS: { key: string; en: string; ar: string }[] = [
  { key: "F1", en: "Focus product/service search", ar: "التركيز على بحث المنتج/الخدمة" },
  { key: "F2", en: "Open payment", ar: "فتح الدفع" },
  { key: "F3", en: "Hold sale", ar: "تعليق الفاتورة" },
  { key: "F4", en: "Start new sale", ar: "بدء فاتورة جديدة" },
  { key: "F5", en: "Open last invoice", ar: "فتح آخر فاتورة" },
  { key: "Ctrl+B", en: "Focus search (barcode scan)", ar: "التركيز على البحث (مسح الباركود)" },
  { key: "Delete", en: "Remove last cart line", ar: "حذف آخر سطر في السلة" },
  { key: "Esc", en: "Close payment popup", ar: "إغلاق نافذة الدفع" },
];

function ShortcutsPopover({ isAr, onClose }: { isAr: boolean; onClose: () => void }) {
  return (
    <div className="absolute start-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{isAr ? "اختصارات لوحة المفاتيح" : "Keyboard Shortcuts"}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-red-500" aria-label="close">
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="space-y-1">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{isAr ? s.ar : s.en}</span>
            <kbd className="ltr-nums rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{s.key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
