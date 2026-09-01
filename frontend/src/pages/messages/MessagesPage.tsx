import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { cn } from "../../lib/cn";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Mail, MailOpen } from "lucide-react";

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

  const { data: unreadCount } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: async () => (await api.get<ApiSuccess<{ count: number }>>("/messages/unread-count")).data.data.count,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "الرسائل" : "Messages"}
        actions={
          <Button
            onClick={() => {
              setReplyTo(null);
              setComposeOpen(true);
            }}
          >
            + {isAr ? "رسالة جديدة" : "Compose"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <StatCard
          icon={Mail}
          cardBg="bg-sky-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "الرسائل" : "Messages"}
          value={String(data?.meta.total ?? 0)}
        />
        <StatCard
          icon={MailOpen}
          cardBg="bg-amber-50"
          iconBg="bg-amber-500"
          iconColor="text-white"
          label={isAr ? "غير مقروءة" : "Unread"}
          value={String(unreadCount ?? 0)}
          warn={Boolean(unreadCount)}
        />
      </div>

      <TableContainer>
        <TableToolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="max-w-xs" />
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "من" : "From"}</Th>
              <Th>{isAr ? "إلى" : "To"}</Th>
              <Th>{isAr ? "الرسالة" : "Message"}</Th>
              <Th>{isAr ? "بواسطة" : "By"}</Th>
              <Th>{isAr ? "إجراءات" : "Action"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((m) => (
              <tr key={m.id} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", !m.readByMe && "bg-sky-50/60")}>
                <td className="px-4 py-3">
                  {!m.readByMe && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-sky-500" aria-hidden />}
                  {m.fromBusinessLocation.branchName}
                </td>
                <td className="px-4 py-3">{m.toBusinessLocation.branchName}</td>
                <td className="px-4 py-3">
                  <p className={cn("text-slate-800", !m.readByMe ? "font-semibold" : "font-medium")}>{m.subject}</p>
                  <p className="line-clamp-1 text-xs text-slate-500">{m.content}</p>
                </td>
                <td className="px-4 py-3 text-slate-500">{m.createdByUser.fullNameEn}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => viewMutation.mutate(m.id)} className="rounded-lg px-2 py-1 font-medium text-sky-600 transition-colors hover:bg-sky-100">
                      {isAr ? "عرض" : "Show"}
                    </button>
                    <button
                      onClick={() => {
                        setReplyTo(m);
                        setComposeOpen(true);
                      }}
                      className="rounded-lg px-2 py-1 font-medium text-sky-600 transition-colors hover:bg-sky-100"
                    >
                      {isAr ? "رد" : "Reply"}
                    </button>
                    <button onClick={() => deleteMutation.mutate(m.id)} className="rounded-lg px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-100">
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
        </Table>
        </TableScroll>
      </TableContainer>

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
        <Modal
          title={viewing.subject}
          subtitle={`${viewing.fromBusinessLocation.branchName} → ${viewing.toBusinessLocation.branchName} · ${viewing.createdByUser.fullNameEn}`}
          onClose={() => setViewing(null)}
        >
          <p className="whitespace-pre-wrap text-sm text-slate-700">{viewing.content}</p>
        </Modal>
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
    <Modal title={isAr ? "رسالة جديدة" : "Compose"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelClass}>{isAr ? "من" : "From"}</label>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputClass}>
            <option value="">{isAr ? "اختر" : "Select"}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "إلى" : "To"}</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputClass}>
            <option value="">{isAr ? "اختر" : "Select"}</option>
            {locations.filter((l) => l.id !== fromId).map((l) => (
              <option key={l.id} value={l.id}>
                {l.branchName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الموضوع" : "Subject"}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "المحتوى" : "Content"}</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={inputClass} />
        </div>
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
        {mutation.isPending ? "…" : isAr ? "إرسال" : "Submit"}
      </Button>
    </Modal>
  );
}
