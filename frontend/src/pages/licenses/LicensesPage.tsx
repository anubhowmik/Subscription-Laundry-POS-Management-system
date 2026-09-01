import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th, Tr, Td } from "../../components/ui/Table";
import { inputClass, labelClass } from "../../components/ui/formClasses";
import { KeyRound, UserCheck, Ticket } from "lucide-react";

interface SeatPurchase {
  id: string;
  seatQuantity: number | null;
  amount: string;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  createdAt: string;
  paidAt: string | null;
}

interface SeatSummary {
  purchasedUserSeats: number;
  usedUserSeats: number;
  availableUserSeats: number;
  seatPriceSar: number;
  history: SeatPurchase[];
}

const STATUS_VARIANT: Record<SeatPurchase["status"], "neutral" | "success" | "danger" | "warning"> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default function LicensesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const [summary, setSummary] = useState<SeatSummary | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<ApiSuccess<SeatSummary>>("/billing/seats")
      .then((res) => setSummary(res.data.data))
      .catch(() => setError(isAr ? "تعذر تحميل بيانات التراخيص" : "Could not load license data"));
  }

  useEffect(load, [isAr]);

  async function buySeats() {
    if (quantity < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ApiSuccess<{ redirectUrl: string }>>("/billing/checkout-seats", { quantity });
      window.location.href = res.data.data.redirectUrl;
    } catch {
      setError(isAr ? "تعذر بدء عملية الدفع" : "Could not start checkout. Please try again.");
      setBusy(false);
    }
  }

  const money = (v: string, currency: string) => `${Number(v).toLocaleString()} ${currency}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "التراخيص" : "Licenses"}
        subtitle={
          isAr
            ? `${summary?.seatPriceSar ?? 10} ريال دفعة واحدة لكل مستخدم إضافي - لا يوجد رسوم شهرية متكررة`
            : `$${summary?.seatPriceSar ?? 10} one-time per additional user - no recurring fee`
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={KeyRound}
            cardBg="bg-sky-50"
            iconBg="bg-sky-500"
            iconColor="text-white"
            label={isAr ? "التراخيص المشتراة" : "Purchased"}
            value={String(summary.purchasedUserSeats)}
          />
          <StatCard
            icon={UserCheck}
            cardBg="bg-app-users-50"
            iconBg="bg-app-users-500"
            iconColor="text-white"
            label={isAr ? "التراخيص المستخدمة" : "Used"}
            value={String(summary.usedUserSeats)}
          />
          <StatCard
            icon={Ticket}
            cardBg="bg-amber-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "التراخيص المتاحة" : "Available"}
            value={String(summary.availableUserSeats)}
            warn={summary.availableUserSeats === 0}
          />
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800">{isAr ? "شراء تراخيص إضافية" : "Purchase additional users"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isAr
            ? `${summary?.seatPriceSar ?? 10} ريال سعودي دفعة واحدة لكل مستخدم - يبقى الترخيص ساريًا دائمًا بعد الشراء`
            : `$${summary?.seatPriceSar ?? 10} one-time per user - stays valid indefinitely once purchased`}
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>{isAr ? "عدد المستخدمين" : "Number of users"}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className={`${inputClass} ltr-nums w-28`}
            />
          </div>
          <Button onClick={buySeats} disabled={busy}>
            {busy
              ? isAr
                ? "جارٍ التحويل…"
                : "Redirecting…"
              : isAr
                ? `شراء (${quantity * (summary?.seatPriceSar ?? 10)} ريال)`
                : `Purchase ($${quantity * (summary?.seatPriceSar ?? 10)})`}
          </Button>
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">{isAr ? "سجل الشراء" : "Purchase history"}</h2>
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "التاريخ" : "Date"}</Th>
                <Th>{isAr ? "المستخدمون المضافون" : "Users Added"}</Th>
                <Th>{isAr ? "المبلغ" : "Amount"}</Th>
                <Th>{isAr ? "الحالة" : "Status"}</Th>
              </tr>
            </THead>
            <tbody>
              {summary && summary.history.length === 0 && (
                <Tr>
                  <Td colSpan={4} className="text-center text-slate-400">
                    {isAr ? "لا توجد سجلات" : "No purchases yet"}
                  </Td>
                </Tr>
              )}
              {summary?.history.map((h) => (
                <Tr key={h.id}>
                  <Td>{new Date(h.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US")}</Td>
                  <Td className="ltr-nums">+{h.seatQuantity ?? 0}</Td>
                  <Td className="ltr-nums">{money(h.amount, h.currency)}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[h.status]}>{h.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
}
