import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card, CardHeader, CardTitle, CardBody } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { labelClass, inputClass } from "../../components/ui/formClasses";

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
  contactCustomField1Label: string | null;
  contactCustomField2Label: string | null;
  contactCustomField3Label: string | null;
  contactCustomField4Label: string | null;
  contactCustomField5Label: string | null;
  contactCustomField6Label: string | null;
  contactCustomField7Label: string | null;
  contactCustomField8Label: string | null;
  contactCustomField9Label: string | null;
  contactCustomField10Label: string | null;
  sellCustomField1Label: string | null;
  sellCustomField2Label: string | null;
  sellCustomField3Label: string | null;
  sellCustomField4Label: string | null;
}

const CUSTOM_FIELD_KEYS = Array.from({ length: 10 }, (_, i) => `contactCustomField${i + 1}Label` as keyof OrgSettings);
const SELL_CUSTOM_FIELD_KEYS = Array.from({ length: 4 }, (_, i) => `sellCustomField${i + 1}Label` as keyof OrgSettings);

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
      <PageHeader title={isAr ? "إعدادات المنشأة" : "Organization Settings"} />

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "السنة المالية والتنسيق" : "Fiscal & Format"}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "بداية السنة المالية (شهر)" : "Fiscal Year Start Month"}</label>
              <input
                type="number"
                min={1}
                max={12}
                value={form.fiscalYearStartMonth ?? 1}
                onChange={(e) => set("fiscalYearStartMonth", Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "تنسيق التاريخ" : "Date Format"}</label>
              <input value={form.dateFormat ?? ""} onChange={(e) => set("dateFormat", e.target.value)} className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.timeFormat24h ?? false} onChange={(e) => set("timeFormat24h", e.target.checked)} />
            {isAr ? "نظام 24 ساعة" : "24-hour time format"}
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "علامة التقارير" : "Report Branding"}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className={labelClass}>{isAr ? "نص أعلى التقرير" : "Report Header Text"}</label>
            <input value={form.reportHeaderText ?? ""} onChange={(e) => set("reportHeaderText", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "نص أسفل التقرير" : "Report Footer Text"}</label>
            <input value={form.reportFooterText ?? ""} onChange={(e) => set("reportFooterText", e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "رابط الشعار" : "Logo URL"}</label>
              <input value={form.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "اللون الرئيسي" : "Theme Color"}</label>
              <input type="color" value={form.themeColor ?? "#0284c7"} onChange={(e) => set("themeColor", e.target.value)} className="h-9 w-full rounded-lg border border-slate-300" />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{isAr ? "برنامج نقاط الولاء" : "Reward Points Program"}</CardTitle>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={form.rewardPointsEnabled ?? true} onChange={(e) => set("rewardPointsEnabled", e.target.checked)} />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "اسم النقاط" : "Points Name"}</label>
              <input value={form.rewardPointsName ?? ""} onChange={(e) => set("rewardPointsName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "قيمة النقطة (ريال)" : "Point Value (SAR)"}</label>
              <input type="number" step="0.01" value={form.pointValueSar ?? ""} onChange={(e) => set("pointValueSar", e.target.value)} className={`${inputClass} ltr-nums`} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "ريال لكل نقطة مكتسبة" : "SAR per Point Earned"}</label>
              <input type="number" step="0.01" value={form.pointsEarnDivisor ?? ""} onChange={(e) => set("pointsEarnDivisor", e.target.value)} className={`${inputClass} ltr-nums`} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الحد الأدنى للطلب لكسب النقاط" : "Min Order for Points"}</label>
              <input type="number" step="0.01" value={form.minOrderForPoints ?? ""} onChange={(e) => set("minOrderForPoints", e.target.value)} className={`${inputClass} ltr-nums`} />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "أقصى نقاط لكل طلب" : "Max Points per Order"}</label>
              <input
                type="number"
                value={form.maxPointsPerOrder ?? ""}
                onChange={(e) => set("maxPointsPerOrder", e.target.value ? Number(e.target.value) : null)}
                placeholder={isAr ? "بلا حد" : "No limit"}
                className={`${inputClass} ltr-nums`}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "أدنى نقاط للاسترداد" : "Min Points to Redeem"}</label>
              <input
                type="number"
                value={form.minRedeemPoints ?? 0}
                onChange={(e) => set("minRedeemPoints", Number(e.target.value))}
                className={`${inputClass} ltr-nums`}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "أقصى نقاط للاسترداد" : "Max Points to Redeem"}</label>
              <input
                type="number"
                value={form.maxRedeemPoints ?? ""}
                onChange={(e) => set("maxRedeemPoints", e.target.value ? Number(e.target.value) : null)}
                placeholder={isAr ? "بلا حد" : "No limit"}
                className={`${inputClass} ltr-nums`}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "انتهاء النقاط (أيام)" : "Points Expiry (days)"}</label>
              <input
                type="number"
                value={form.pointsExpiryDays ?? ""}
                onChange={(e) => set("pointsExpiryDays", e.target.value ? Number(e.target.value) : null)}
                placeholder={isAr ? "لا تنتهي" : "Never expires"}
                className={`${inputClass} ltr-nums`}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{isAr ? "تذكيرات الدفع" : "Payment Reminders"}</CardTitle>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.paymentReminderEnabled ?? false}
              onChange={(e) => set("paymentReminderEnabled", e.target.checked)}
            />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-slate-400">
            {isAr
              ? "يتم إرسال رسالة تذكير تلقائيًا للفواتير المتأخرة عبر مهمة مجدولة تعمل كل ساعة."
              : "Overdue invoices get an automatic reminder text via an hourly background job."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{isAr ? "التذكير الأول بعد (أيام)" : "First Reminder After (days)"}</label>
              <input
                type="number"
                min={1}
                value={form.paymentReminderAfterDays ?? 7}
                onChange={(e) => set("paymentReminderAfterDays", Number(e.target.value))}
                className={`${inputClass} ltr-nums`}
              />
            </div>
            <div>
              <label className={labelClass}>{isAr ? "الفاصل بين التذكيرات (أيام)" : "Repeat Interval (days)"}</label>
              <input
                type="number"
                min={1}
                value={form.paymentReminderIntervalDays ?? 7}
                onChange={(e) => set("paymentReminderIntervalDays", Number(e.target.value))}
                className={`${inputClass} ltr-nums`}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{isAr ? "موافقة العملاء" : "Customer Approval"}</CardTitle>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.customerApprovalRequired ?? false}
              onChange={(e) => set("customerApprovalRequired", e.target.checked)}
            />
            {isAr ? "مفعّل" : "Enabled"}
          </label>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-slate-400">
            {isAr
              ? "عند التفعيل، يبدأ العملاء الجدد بحالة معلّقة ولا يمكنهم الشراء حتى تتم الموافقة عليهم."
              : "When enabled, new customers start pending approval and can't check out until approved."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "تسميات الحقول المخصصة لجهات الاتصال" : "Contact Custom Field Labels"}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-xs text-slate-400">
            {isAr
              ? "تُستخدم هذه التسميات لحقول الموردين والعملاء المخصصة. اتركها فارغة لاستخدام \"حقل مخصص رقم\" الافتراضي."
              : "These labels apply to both Suppliers' and Customers' custom fields. Leave blank to use the default \"Custom Field N\"."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CUSTOM_FIELD_KEYS.map((key, i) => (
              <div key={key}>
                <label className={labelClass}>{isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`}</label>
                <input
                  value={(form[key] as string | null) ?? ""}
                  onChange={(e) => set(key, (e.target.value || null) as OrgSettings[typeof key])}
                  placeholder={isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "تسميات الحقول المخصصة للبيع" : "Sale Custom Field Labels"}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 text-xs text-slate-400">
            {isAr
              ? "تُستخدم هذه التسميات للحقول المخصصة عند إضافة عملية بيع. اتركها فارغة لاستخدام \"حقل مخصص رقم\" الافتراضي."
              : "These labels apply to Add Sale's custom fields. Leave blank to use the default \"Custom Field N\"."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {SELL_CUSTOM_FIELD_KEYS.map((key, i) => (
              <div key={key}>
                <label className={labelClass}>{isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`}</label>
                <input
                  value={(form[key] as string | null) ?? ""}
                  onChange={(e) => set(key, (e.target.value || null) as OrgSettings[typeof key])}
                  placeholder={isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </div>
  );
}
