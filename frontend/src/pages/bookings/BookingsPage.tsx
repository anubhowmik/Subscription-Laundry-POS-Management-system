import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";

type BookingType = "PICKUP" | "DELIVERY";
type BookingStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

const STATUS_LABEL: Record<BookingStatus, { en: string; ar: string; cls: string }> = {
  REQUESTED: { en: "Requested", ar: "مطلوب", cls: "bg-slate-100 text-slate-600" },
  CONFIRMED: { en: "Confirmed", ar: "مؤكد", cls: "bg-sky-100 text-sky-700" },
  COMPLETED: { en: "Completed", ar: "مكتمل", cls: "bg-green-100 text-green-700" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", cls: "bg-red-100 text-red-700" },
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الحجوزات" : "Bookings"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "حجز جديد" : "New Booking"}
        </button>
      </div>

      <div className="flex gap-2">
        {(["", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s === "" ? (isAr ? "الكل" : "All") : isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الموعد" : "Scheduled"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "النوع" : "Type"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "العميل" : "Customer"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "العنوان" : "Address"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{new Date(b.scheduledAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.type === "PICKUP" ? "bg-amber-100 text-amber-700" : "bg-teal-100 text-teal-700"}`}>
                    {b.type === "PICKUP" ? (isAr ? "استلام" : "Pickup") : isAr ? "توصيل" : "Delivery"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {isAr ? b.customer.nameAr || b.customer.nameEn : b.customer.nameEn} <span className="ltr-nums text-xs text-slate-400">({b.customer.phone})</span>
                </td>
                <td className="max-w-[200px] truncate px-4 py-2 text-slate-500">{b.address ?? "—"}</td>
                <td className="px-4 py-2">{b.businessLocation.branchName}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[b.status].cls}`}>
                    {isAr ? STATUS_LABEL[b.status].ar : STATUS_LABEL[b.status].en}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex justify-end gap-1.5">
                    {b.status === "REQUESTED" && (
                      <button onClick={() => statusMutation.mutate({ id: b.id, status: "CONFIRMED" })} className="rounded border border-sky-200 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50">
                        {isAr ? "تأكيد" : "Confirm"}
                      </button>
                    )}
                    {b.status === "CONFIRMED" && (
                      <button onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })} className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50">
                        {isAr ? "إتمام" : "Complete"}
                      </button>
                    )}
                    {(b.status === "REQUESTED" || b.status === "CONFIRMED") && (
                      <button onClick={() => statusMutation.mutate({ id: b.id, status: "CANCELLED" })} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        {isAr ? "إلغاء" : "Cancel"}
                      </button>
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
        </table>
      </div>

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "حجز جديد" : "New Booking"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "العميل" : "Customer"}</label>
            <input
              value={picked ? (isAr ? picked.nameAr || picked.nameEn : picked.nameEn) : search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث بالاسم أو الهاتف" : "Search by name or phone"}
              className={inp}
            />
            {results.length > 0 && !picked && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setPicked(c);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "النوع" : "Type"}</label>
              <select value={type} onChange={(e) => setType(e.target.value as BookingType)} className={inp}>
                <option value="PICKUP">{isAr ? "استلام" : "Pickup"}</option>
                <option value="DELIVERY">{isAr ? "توصيل" : "Delivery"}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
              <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inp}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "التاريخ والوقت" : "Date & Time"}</label>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "العنوان" : "Address"}</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
