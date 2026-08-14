import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";

interface AnnouncementRow {
  id: string;
  fromDate: string;
  toDate: string;
  content: string;
  isPublished: boolean;
  locations: { businessLocation: { branchName: string } }[];
  createdByUser: { fullNameEn: string };
}

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<AnnouncementRow[]>>("/announcements", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الإعلانات" : "Announcements"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "إضافة إعلان" : "Add"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "من تاريخ" : "From Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "إلى تاريخ" : "To Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الإعلان" : "Announcement"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "إجراءات" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((a) => (
              <tr key={a.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{new Date(a.fromDate).toLocaleDateString(locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{new Date(a.toDate).toLocaleDateString(locale)}</span></td>
                <td className="px-4 py-2">
                  {a.locations.length === 0
                    ? isAr
                      ? "كل الفروع"
                      : "All locations"
                    : a.locations.map((l) => l.businessLocation.branchName).join(", ")}
                </td>
                <td className="max-w-xs truncate px-4 py-2">{a.content}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${a.isPublished ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {a.isPublished ? (isAr ? "منشور" : "Published") : (isAr ? "مسودة" : "Draft")}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => deleteMutation.mutate(a.id)} className="text-xs text-red-600 hover:underline">
                    {isAr ? "حذف" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <AnnouncementFormModal
          isAr={isAr}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["announcements"] });
            qc.invalidateQueries({ queryKey: ["active-announcements"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AnnouncementFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const { locations } = useBusinessLocation();
  const today = new Date().toISOString().slice(0, 10);
  const [businessLocationIds, setBusinessLocationIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function toggleLocation(id: string) {
    setBusinessLocationIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/announcements", {
        businessLocationIds,
        fromDate,
        toDate,
        content,
        isPublished,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(fromDate) && Boolean(toDate) && toDate >= fromDate && content.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "إضافة إعلان" : "Add Announcement"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من تاريخ" : "From Date"}</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى تاريخ" : "To Date"}</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {isAr ? "الفروع" : "Business Locations"} <span className="text-slate-400">({isAr ? "اتركه فارغًا لكل الفروع" : "leave empty for all locations"})</span>
            </label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-300 p-2">
              {locations.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={businessLocationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} />
                  {l.branchName}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الإعلان" : "Announcement"}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className={inp} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            {isAr ? "منشور" : "Published"}
          </label>
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
