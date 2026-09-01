import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Alert } from "../../components/ui/Alert";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, textareaClass } from "../../components/ui/formClasses";

interface NotificationSettings {
  provider: "UNIFONIC";
  senderId: string | null;
  enabled: boolean;
  hasAppSid: boolean;
}

type NotificationTrigger = "ORDER_READY" | "ORDER_DELIVERED" | "NEW_SALE" | "PAYMENT_RECEIVED" | "PAYMENT_REMINDER" | "COMPENSATION_RESOLVED";

interface NotificationTemplateRow {
  trigger: NotificationTrigger;
  messageEn: string;
  messageAr: string;
  isEnabled: boolean;
}

const TRIGGER_LABEL: Record<NotificationTrigger, { en: string; ar: string }> = {
  ORDER_READY: { en: "Order Ready", ar: "الطلب جاهز" },
  ORDER_DELIVERED: { en: "Order Delivered", ar: "تم تسليم الطلب" },
  NEW_SALE: { en: "New Sale", ar: "بيع جديد" },
  PAYMENT_RECEIVED: { en: "Payment Received", ar: "تم استلام الدفعة" },
  PAYMENT_REMINDER: { en: "Payment Reminder", ar: "تذكير بالدفع" },
  COMPENSATION_RESOLVED: { en: "Compensation Resolved", ar: "تسوية التعويض" },
};

interface NotificationLogRow {
  id: string;
  toPhone: string;
  message: string;
  status: "SENT" | "FAILED" | "TEST";
  referenceType: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<NotificationLogRow["status"], { en: string; ar: string; variant: "success" | "danger" | "warning" }> = {
  SENT: { en: "Sent", ar: "أُرسل", variant: "success" },
  FAILED: { en: "Failed", ar: "فشل", variant: "danger" },
  TEST: { en: "Test (not sent)", ar: "تجريبي (لم يُرسل)", variant: "warning" },
};

export default function NotificationSettingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => (await api.get<ApiSuccess<NotificationSettings>>("/notifications/settings")).data.data,
  });
  const { data: logs } = useQuery({
    queryKey: ["notification-logs"],
    queryFn: async () => (await api.get<ApiSuccess<NotificationLogRow[]>>("/notifications/logs")).data.data,
  });
  const { data: templates } = useQuery({
    queryKey: ["notification-templates"],
    queryFn: async () => (await api.get<ApiSuccess<NotificationTemplateRow[]>>("/notifications/templates")).data.data,
  });

  const [senderId, setSenderId] = useState("");
  const [appSid, setAppSid] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setSenderId(settings.senderId ?? "");
    setEnabled(settings.enabled);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => api.put("/notifications/settings", { senderId: senderId || undefined, appSid: appSid || undefined, enabled }),
    onSuccess: () => {
      setAppSid("");
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
      qc.invalidateQueries({ queryKey: ["notification-logs"] });
      setError(null);
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={isAr ? "إشعارات الرسائل النصية" : "SMS Notifications"} />
      <p className="text-sm text-slate-500">
        {isAr
          ? "يتم إرسال رسالة نصية تلقائيًا للعميل عند جهوز الطلب أو تسليمه. المزود الحالي: Unifonic. حتى تُفعّل الإعدادات، تُسجَّل الرسائل فقط دون إرسال فعلي."
          : "A text message is sent automatically when an order becomes ready or is delivered. Current provider: Unifonic. Until you enable this with real credentials, messages are only logged, never actually sent."}
      </p>

      <Card className="space-y-4 p-5">
        <div>
          <label className={labelClass}>{isAr ? "Sender ID" : "Sender ID"}</label>
          <input value={senderId} onChange={(e) => setSenderId(e.target.value)} placeholder="MyLaundry" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            App Sid {settings?.hasAppSid && <span className="text-emerald-600">({isAr ? "مُعدّ" : "configured"})</span>}
          </label>
          <input
            type="password"
            value={appSid}
            onChange={(e) => setAppSid(e.target.value)}
            placeholder={settings?.hasAppSid ? (isAr ? "اتركه فارغًا للإبقاء على القيمة الحالية" : "Leave blank to keep current value") : "App Sid"}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {isAr ? "تفعيل الإرسال الفعلي" : "Enable real sending"}
        </label>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{isAr ? "قوالب الرسائل" : "Message Templates"}</h2>
        <p className="mb-3 text-xs text-slate-500">
          {isAr
            ? "المتغيرات المتاحة: {customerName} {invoiceNumber} {amount} {dueAmount}"
            : "Available placeholders: {customerName} {invoiceNumber} {amount} {dueAmount}"}
        </p>
        <div className="space-y-3">
          {templates?.map((tpl) => (
            <TemplateCard key={tpl.trigger} isAr={isAr} template={tpl} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{isAr ? "آخر الرسائل" : "Recent Messages"}</h2>
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "الوقت" : "Time"}</Th>
                <Th>{isAr ? "الهاتف" : "Phone"}</Th>
                <Th>{isAr ? "الرسالة" : "Message"}</Th>
                <Th>{t("common.status")}</Th>
              </tr>
            </THead>
            <tbody>
              {logs?.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(l.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                  <td className="px-4 py-3"><span className="ltr-nums">{l.toPhone}</span></td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-slate-600" title={l.message}>
                    {l.message}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_LABEL[l.status].variant} title={l.errorMessage ?? undefined}>
                      {isAr ? STATUS_LABEL[l.status].ar : STATUS_LABEL[l.status].en}
                    </Badge>
                  </td>
                </tr>
              ))}
              {logs?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
}

function TemplateCard({ isAr, template }: { isAr: boolean; template: NotificationTemplateRow }) {
  const qc = useQueryClient();
  const [messageEn, setMessageEn] = useState(template.messageEn);
  const [messageAr, setMessageAr] = useState(template.messageAr);
  const [isEnabled, setIsEnabled] = useState(template.isEnabled);

  const mutation = useMutation({
    mutationFn: async () => api.put(`/notifications/templates/${template.trigger}`, { messageEn, messageAr, isEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-templates"] }),
  });

  const dirty = messageEn !== template.messageEn || messageAr !== template.messageAr || isEnabled !== template.isEnabled;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{isAr ? TRIGGER_LABEL[template.trigger].ar : TRIGGER_LABEL[template.trigger].en}</h3>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          {isAr ? "مفعّل" : "Enabled"}
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>English</label>
          <textarea value={messageEn} onChange={(e) => setMessageEn(e.target.value)} rows={2} className={textareaClass} />
        </div>
        <div>
          <label className={labelClass}>العربية</label>
          <textarea value={messageAr} onChange={(e) => setMessageAr(e.target.value)} dir="rtl" rows={2} className={textareaClass} />
        </div>
      </div>
      {dirty && (
        <Button size="sm" className="mt-2" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      )}
    </Card>
  );
}
