import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";

interface MessageRow {
  id: string;
  subject: string;
  content: string;
  createdAt: string;
  fromBusinessLocation: { branchName: string };
  toBusinessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  readByMe: boolean;
}

export default function MessagesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [viewing, setViewing] = useState<MessageRow | null>(null);

  const { data } = useQuery({
    queryKey: ["messages", search],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<MessageRow[]>>("/messages", { params: { search, limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  // Fetching a message's detail marks it read server-side, so viewing doubles as the mutation.
  const viewMutation = useMutation({
    mutationFn: async (id: string) => (await api.get<ApiSuccess<MessageRow>>(`/messages/${id}`)).data.data,
    onSuccess: (message) => {
      setViewing(message);
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: ["messages-unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الرسائل" : "Messages"}</h1>
        <button
          onClick={() => {
            setReplyTo(null);
            setComposeOpen(true);
          }}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {isAr ? "رسالة جديدة" : "Compose"}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "من" : "From"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "إلى" : "To"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الرسالة" : "Message"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "إجراءات" : "Action"}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((m) => (
              <tr key={m.id} className={`border-b border-slate-100 ${!m.readByMe ? "bg-sky-50/60" : ""}`}>
                <td className="px-4 py-2">
                  {!m.readByMe && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-sky-500" aria-hidden />}
                  {m.fromBusinessLocation.branchName}
                </td>
                <td className="px-4 py-2">{m.toBusinessLocation.branchName}</td>
                <td className="px-4 py-2">
                  <p className={`text-slate-800 ${!m.readByMe ? "font-semibold" : "font-medium"}`}>{m.subject}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{m.content}</p>
                </td>
                <td className="px-4 py-2 text-slate-500">{m.createdByUser.fullNameEn}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => viewMutation.mutate(m.id)} className="text-sky-600 hover:underline">
                      {isAr ? "عرض" : "Show"}
                    </button>
                    <button
                      onClick={() => {
                        setReplyTo(m);
                        setComposeOpen(true);
                      }}
                      className="text-sky-600 hover:underline"
                    >
                      {isAr ? "رد" : "Reply"}
                    </button>
                    <button onClick={() => deleteMutation.mutate(m.id)} className="text-red-600 hover:underline">
                      {isAr ? "حذف" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {composeOpen && (
        <ComposeModal
          isAr={isAr}
          replyTo={replyTo}
          onClose={() => setComposeOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["messages"] });
            setComposeOpen(false);
          }}
        />
      )}

      {viewing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">{viewing.subject}</h3>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {viewing.fromBusinessLocation.branchName} → {viewing.toBusinessLocation.branchName} · {viewing.createdByUser.fullNameEn}
            </p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{viewing.content}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ComposeModal({
  isAr,
  replyTo,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  replyTo: MessageRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locations } = useBusinessLocation();
  const [fromId, setFromId] = useState(replyTo ? replyTo.toBusinessLocation && locations.find((l) => l.branchName === replyTo.toBusinessLocation.branchName)?.id || "" : "");
  const [toId, setToId] = useState(replyTo ? locations.find((l) => l.branchName === replyTo.fromBusinessLocation.branchName)?.id || "" : "");
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : "");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/messages", { fromBusinessLocationId: fromId, toBusinessLocationId: toId, subject, content }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(fromId) && Boolean(toId) && fromId !== toId && subject.trim().length > 0 && content.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "رسالة جديدة" : "Compose"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inp}>
              <option value="">{isAr ? "اختر" : "Select"}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className={inp}>
              <option value="">{isAr ? "اختر" : "Select"}</option>
              {locations.filter((l) => l.id !== fromId).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الموضوع" : "Subject"}</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المحتوى" : "Content"}</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={inp} />
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
          {mutation.isPending ? "…" : isAr ? "إرسال" : "Submit"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
