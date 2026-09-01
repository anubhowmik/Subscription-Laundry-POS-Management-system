import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Megaphone } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الإعلانات" : "Announcements"}
        actions={<Button onClick={() => setFormOpen(true)}>+ {isAr ? "إضافة إعلان" : "Add"}</Button>}
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={Megaphone}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "الإعلانات" : "Announcements"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "من تاريخ" : "From Date"}</Th>
              <Th>{isAr ? "إلى تاريخ" : "To Date"}</Th>
              <Th>{isAr ? "الفرع" : "Branch"}</Th>
              <Th>{isAr ? "الإعلان" : "Announcement"}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{isAr ? "إجراءات" : "Action"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{new Date(a.fromDate).toLocaleDateString(locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{new Date(a.toDate).toLocaleDateString(locale)}</span></td>
                <td className="px-4 py-3">
                  {a.locations.length === 0
                    ? isAr
                      ? "كل الفروع"
                      : "All locations"
                    : a.locations.map((l) => l.businessLocation.branchName).join(", ")}
                </td>
                <td className="max-w-xs truncate px-4 py-3">{a.content}</td>
                <td className="px-4 py-3">
                  <Badge variant={a.isPublished ? "success" : "neutral"}>
                    {a.isPublished ? (isAr ? "منشور" : "Published") : (isAr ? "مسودة" : "Draft")}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteMutation.mutate(a.id)} className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100">
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
        </Table>
      </TableContainer>

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
    <Modal title={isAr ? "إضافة إعلان" : "Add Announcement"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "من تاريخ" : "From Date"}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "إلى تاريخ" : "To Date"}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>
            {isAr ? "الفروع" : "Business Locations"} <span className="text-slate-400">({isAr ? "اتركه فارغًا لكل الفروع" : "leave empty for all locations"})</span>
          </label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
            {locations.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={businessLocationIds.includes(l.id)} onChange={() => toggleLocation(l.id)} />
                {l.branchName}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الإعلان" : "Announcement"}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          {isAr ? "منشور" : "Published"}
        </label>
      </div>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          mutation.mutate();
        }}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}
