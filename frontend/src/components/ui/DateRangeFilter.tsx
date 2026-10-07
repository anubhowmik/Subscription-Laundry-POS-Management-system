import { CalendarDays } from "lucide-react";
import { cn } from "../../lib/cn";
import { inputClass, selectClass } from "./formClasses";

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisMonthLastYear"
  | "thisYear"
  | "lastYear"
  | "currentFY"
  | "lastFY"
  | "custom";

// The reference's global daterangepicker `ranges`, in its own order (read off the live site).
const PRESETS: { key: DateRangePreset; en: string; ar: string }[] = [
  { key: "today", en: "Today", ar: "اليوم" },
  { key: "yesterday", en: "Yesterday", ar: "أمس" },
  { key: "last7", en: "Last 7 Days", ar: "آخر 7 أيام" },
  { key: "last30", en: "Last 30 Days", ar: "آخر 30 يومًا" },
  { key: "thisMonth", en: "This Month", ar: "هذا الشهر" },
  { key: "lastMonth", en: "Last Month", ar: "الشهر الماضي" },
  { key: "thisMonthLastYear", en: "This month last year", ar: "هذا الشهر من العام الماضي" },
  { key: "thisYear", en: "This Year", ar: "هذا العام" },
  { key: "lastYear", en: "Last Year", ar: "العام الماضي" },
  { key: "currentFY", en: "Current financial year", ar: "السنة المالية الحالية" },
  { key: "lastFY", en: "Last financial year", ar: "السنة المالية السابقة" },
  { key: "custom", en: "Custom Range", ar: "نطاق مخصص" },
];

/** Local calendar date as YYYY-MM-DD (never toISOString(), which is the UTC date). */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Resolves a preset to its [from, to] dates. `fiscalYearStartMonth` is 1-12 (Organization setting). */
export function presetRange(preset: Exclude<DateRangePreset, "custom">, fiscalYearStartMonth = 1): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (offset: number) => new Date(y, m, now.getDate() + offset);
  switch (preset) {
    case "today":
      return { from: ymd(now), to: ymd(now) };
    case "yesterday":
      return { from: ymd(day(-1)), to: ymd(day(-1)) };
    case "last7":
      return { from: ymd(day(-6)), to: ymd(now) };
    case "last30":
      return { from: ymd(day(-29)), to: ymd(now) };
    case "thisMonth":
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "thisMonthLastYear":
      return { from: ymd(new Date(y - 1, m, 1)), to: ymd(new Date(y - 1, m + 1, 0)) };
    case "thisYear":
      return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 11, 31)) };
    case "lastYear":
      return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) };
    case "currentFY":
    case "lastFY": {
      const startMonth = fiscalYearStartMonth - 1;
      let startYear = m >= startMonth ? y : y - 1;
      if (preset === "lastFY") startYear -= 1;
      return { from: ymd(new Date(startYear, startMonth, 1)), to: ymd(new Date(startYear + 1, startMonth, 0)) };
    }
  }
}

export interface DateRangeValue {
  preset: DateRangePreset;
  from: string;
  to: string;
}

export function initialDateRange(preset: Exclude<DateRangePreset, "custom"> = "today", fiscalYearStartMonth = 1): DateRangeValue {
  return { preset, ...presetRange(preset, fiscalYearStartMonth) };
}

/** Preset picker + From/To dates - the reference's date-range picker, as native controls. */
export function DateRangeFilter({
  value,
  onChange,
  isAr,
  fiscalYearStartMonth = 1,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  isAr: boolean;
  fiscalYearStartMonth?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
        <select
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as DateRangePreset;
            onChange(preset === "custom" ? { ...value, preset } : { preset, ...presetRange(preset, fiscalYearStartMonth) });
          }}
          className={cn(selectClass, "ps-9")}
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {isAr ? p.ar : p.en}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          aria-label={isAr ? "من" : "From"}
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ preset: "custom", from: e.target.value, to: value.to })}
          className={cn(inputClass, "ltr-nums")}
        />
        <input
          type="date"
          aria-label={isAr ? "إلى" : "To"}
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ preset: "custom", from: value.from, to: e.target.value })}
          className={cn(inputClass, "ltr-nums")}
        />
      </div>
    </div>
  );
}
