import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useTranslation } from "react-i18next";

interface OrgSettings {
  fiscalYearStartMonth: number;
  dateFormat: string;
  timeFormat24h: boolean;
  reportHeaderText: string | null;
  reportFooterText: string | null;
  logoUrl: string | null;
  themeColor: string | null;
  rewardPointsEnabled: boolean;
  rewardPointsName: string;
  pointValueSar: string;
  pointsEarnDivisor: string;
  minOrderForPoints: string;
  maxPointsPerOrder: number | null;
  minRedeemPoints: number;
  maxRedeemPoints: number | null;
  pointsExpiryDays: number | null;
  paymentReminderEnabled: boolean;
  paymentReminderAfterDays: number;
  paymentReminderIntervalDays: number;
  customerApprovalRequired: boolean;
}

export default function OrganizationSettingsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["organization-settings"],
    queryFn: async () => (await api.get<ApiSuccess<OrgSettings>>("/organizations/settings")).data.data,
  });

  const [form, setForm] = useState<Partial<OrgSettings>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () =>
      api.put("/organizations/settings", {
        ...form,
        pointValueSar: form.pointValueSar !== undefined ? Number(form.pointValueSar) : undefined,
        pointsEarnDivisor: form.pointsEarnDivisor !== undefined ? Number(form.pointsEarnDivisor) : undefined,
        minOrderForPoints: form.minOrderForPoints !== undefined ? Number(form.minOrderForPoints) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization-settings"] });
      setError(null);
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  function set<K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">{isAr ? "إعدادات المنشأة" : "Organization Settings"}</h1>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{isAr ? "السنة المالية والتنسيق" : "Fiscal & Format"}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "بداية السنة المالية (شهر)" : "Fiscal Year Start Month"}</label>
            <input
              type="number"
              min={1}
              max={12}
              value={form.fiscalYearStartMonth ?? 1}
              onChange={(e) => set("fiscalYearStartMonth", Number(e.target.value))}
              className={inp}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "تنسيق التاريخ" : "Date Format"}</label>
            <input value={form.dateFormat ?? ""} onChange={(e) => set("dateFormat", e.target.value)} className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.timeFormat24h ?? false} onChange={(e) => set("timeFormat24h", e.target.checked)} />
          {isAr ? "نظام 24 ساعة" : "24-hour time format"}
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{isAr ? "علامة التقارير" : "Report Branding"}</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نص أعلى التقرير" : "Report Header Text"}</label>
          <input value={form.reportHeaderText ?? ""} onChange={(e) => set("reportHeaderText", e.target.value)} className={inp} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "نص أسفل التقرير" : "Report Footer Text"}</label>
          <input value={form.reportFooterText ?? ""} onChange={(e) => set("reportFooterText", e.target.value)} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "رابط الشعار" : "Logo URL"}</label>
            <input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "اللون الرئيسي" : "Theme Color"}</label>
            <input type="color" value={form.themeColor ?? "#0284c7"} onChange={(e) => set("themeColor", e.target.value)} className="h-9 w-full rounded-md border border-slate-300" />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{isAr ? "برنامج نقاط الولاء" : "Reward Points Program"}</h2>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={form.rewardPointsEnabled ?? true} onChange={(e) => set("rewardPointsEnabled", e.target.checked)} />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "اسم النقاط" : "Points Name"}</label>
            <input value={form.rewardPointsName ?? ""} onChange={(e) => set("rewardPointsName", e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "قيمة النقطة (ريال)" : "Point Value (SAR)"}</label>
            <input type="number" step="0.01" value={form.pointValueSar ?? ""} onChange={(e) => set("pointValueSar", e.target.value)} className={`${inp} ltr-nums`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ريال لكل نقطة مكتسبة" : "SAR per Point Earned"}</label>
            <input type="number" step="0.01" value={form.pointsEarnDivisor ?? ""} onChange={(e) => set("pointsEarnDivisor", e.target.value)} className={`${inp} ltr-nums`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الحد الأدنى للطلب لكسب النقاط" : "Min Order for Points"}</label>
            <input type="number" step="0.01" value={form.minOrderForPoints ?? ""} onChange={(e) => set("minOrderForPoints", e.target.value)} className={`${inp} ltr-nums`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أقصى نقاط لكل طلب" : "Max Points per Order"}</label>
            <input
              type="number"
              value={form.maxPointsPerOrder ?? ""}
              onChange={(e) => set("maxPointsPerOrder", e.target.value ? Number(e.target.value) : null)}
              placeholder={isAr ? "بلا حد" : "No limit"}
              className={`${inp} ltr-nums`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أدنى نقاط للاسترداد" : "Min Points to Redeem"}</label>
            <input
              type="number"
              value={form.minRedeemPoints ?? 0}
              onChange={(e) => set("minRedeemPoints", Number(e.target.value))}
              className={`${inp} ltr-nums`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أقصى نقاط للاسترداد" : "Max Points to Redeem"}</label>
            <input
              type="number"
              value={form.maxRedeemPoints ?? ""}
              onChange={(e) => set("maxRedeemPoints", e.target.value ? Number(e.target.value) : null)}
              placeholder={isAr ? "بلا حد" : "No limit"}
              className={`${inp} ltr-nums`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "انتهاء النقاط (أيام)" : "Points Expiry (days)"}</label>
            <input
              type="number"
              value={form.pointsExpiryDays ?? ""}
              onChange={(e) => set("pointsExpiryDays", e.target.value ? Number(e.target.value) : null)}
              placeholder={isAr ? "لا تنتهي" : "Never expires"}
              className={`${inp} ltr-nums`}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{isAr ? "تذكيرات الدفع" : "Payment Reminders"}</h2>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.paymentReminderEnabled ?? false}
              onChange={(e) => set("paymentReminderEnabled", e.target.checked)}
            />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </div>
        <p className="text-[11px] text-slate-400">
          {isAr
            ? "يتم إرسال رسالة تذكير تلقائيًا للفواتير المتأخرة عبر مهمة مجدولة تعمل كل ساعة."
            : "Overdue invoices get an automatic reminder text via an hourly background job."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "التذكير الأول بعد (أيام)" : "First Reminder After (days)"}</label>
            <input
              type="number"
              min={1}
              value={form.paymentReminderAfterDays ?? 7}
              onChange={(e) => set("paymentReminderAfterDays", Number(e.target.value))}
              className={`${inp} ltr-nums`}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفاصل بين التذكيرات (أيام)" : "Repeat Interval (days)"}</label>
            <input
              type="number"
              min={1}
              value={form.paymentReminderIntervalDays ?? 7}
              onChange={(e) => set("paymentReminderIntervalDays", Number(e.target.value))}
              className={`${inp} ltr-nums`}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{isAr ? "موافقة العملاء" : "Customer Approval"}</h2>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.customerApprovalRequired ?? false}
              onChange={(e) => set("customerApprovalRequired", e.target.checked)}
            />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </div>
        <p className="text-[11px] text-slate-400">
          {isAr
            ? "عند التفعيل، يبدأ العملاء الجدد بحالة معلّقة ولا يمكنهم الشراء حتى تتم الموافقة عليهم."
            : "When enabled, new customers start pending approval and can't check out until approved."}
        </p>
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </button>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
