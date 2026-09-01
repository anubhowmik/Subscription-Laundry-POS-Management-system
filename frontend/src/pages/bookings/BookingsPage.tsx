import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { inputClass, selectClass, labelClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { CalendarClock } from "lucide-react";

type BookingType = "PICKUP" | "DELIVERY";
type BookingStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

const STATUS_LABEL: Record<BookingStatus, { en: string; ar: string; variant: "neutral" | "info" | "success" | "danger" }> = {
  REQUESTED: { en: "Requested", ar: "مطلوب", variant: "neutral" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد", variant: "info" },
  COMPLETED: { en: "Completed", ar: "مكتمل", variant: "success" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", variant: "danger" },
};

interface BookingRow {
  id: string;
  type: BookingType;
  scheduledAt: string;
  address: string | null;
  status: BookingStatus;
  notes: string | null;
  customer: { nameEn: string; nameAr: string | null; phone: string };
  businessLocation: { branchName: string };
}

export default function BookingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<BookingStatus | "">("");
  const [formOpen, setFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["bookings", statusFilter],
    queryFn: async () => (await api.get<ApiSuccess<BookingRow[]>>("/bookings", { params: { status: statusFilter || undefined } })).data.data,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => api.put(`/bookings/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الحجوزات" : "Bookings"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "حجز جديد" : "New Booking"}</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={CalendarClock}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "الحجوزات" : "Bookings"}
          value={String(data?.length ?? 0)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {s === "" ? (isAr ? "الكل" : "All") : isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
          </button>
        ))}
      </div>

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "الموعد" : "Scheduled"}</Th>
              <Th>{isAr ? "النوع" : "Type"}</Th>
              <Th>{isAr ? "العميل" : "Customer"}</Th>
              <Th>{isAr ? "العنوان" : "Address"}</Th>
              <Th>{isAr ? "الفرع" : "Branch"}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="!text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{new Date(b.scheduledAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={b.type === "PICKUP" ? "warning" : "info"} className={b.type === "DELIVERY" ? "!bg-teal-100 !text-teal-700 !ring-teal-200" : ""}>
                    {b.type === "PICKUP" ? (isAr ? "استلام" : "Pickup") : isAr ? "توصيل" : "Delivery"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {isAr ? b.customer.nameAr || b.customer.nameEn : b.customer.nameEn} <span className="ltr-nums text-xs text-slate-400">({b.customer.phone})</span>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">{b.address ?? "—"}</td>
                <td className="px-4 py-3">{b.businessLocation.branchName}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_LABEL[b.status].variant}>{isAr ? STATUS_LABEL[b.status].ar : STATUS_LABEL[b.status].en}</Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-1.5">
                    {b.status === "REQUESTED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="!border-sky-200 !text-sky-700 hover:!bg-sky-50"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "CONFIRMED" })}
                      >
                        {isAr ? "تأكيد" : "Confirm"}
                      </Button>
                    )}
                    {b.status === "CONFIRMED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="!border-green-200 !text-green-700 hover:!bg-green-50"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}
                      >
                        {isAr ? "إتمام" : "Complete"}
                      </Button>
                    )}
                    {(b.status === "REQUESTED" || b.status === "CONFIRMED") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="!border-red-200 !text-red-600 hover:!bg-red-50"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "CANCELLED" })}
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableContainer>

      {formOpen && <BookingFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}
    </div>
  );
}

interface CustomerPick {
  id: string;
  nameEn: string;
  nameAr: string | null;
  phone: string;
}

function BookingFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { locations, currentLocationId } = useBusinessLocation();

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [type, setType] = useState<BookingType>("PICKUP");
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerPick[]>([]);
  const [picked, setPicked] = useState<CustomerPick | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<CustomerPick[]>>("/customers", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/bookings", {
        businessLocationId,
        customerId: picked!.id,
        type,
        scheduledAt: new Date(scheduledAt).toISOString(),
        address: address || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picked) && businessLocationId && scheduledAt;

  return (
    <Modal
      title={isAr ? "حجز جديد" : "New Booking"}
      onClose={onClose}
      footer={
        <Button
          fullWidth
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
        >
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <label className={labelClass}>{isAr ? "العميل" : "Customer"}</label>
          <input
            value={picked ? (isAr ? picked.nameAr || picked.nameEn : picked.nameEn) : search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={isAr ? "ابحث بالاسم أو الهاتف" : "Search by name or phone"}
            className={inputClass}
          />
          {results.length > 0 && !picked && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setPicked(c);
                    setResults([]);
                  }}
                  className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "النوع" : "Type"}</label>
            <select value={type} onChange={(e) => setType(e.target.value as BookingType)} className={selectClass}>
              <option value="PICKUP">{isAr ? "استلام" : "Pickup"}</option>
              <option value="DELIVERY">{isAr ? "توصيل" : "Delivery"}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الفرع" : "Branch"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={selectClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "التاريخ والوقت" : "Date & Time"}</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "العنوان" : "Address"}</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
