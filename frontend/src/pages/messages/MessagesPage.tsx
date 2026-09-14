import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { confirmAction } from "../../stores/confirmStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { SearchInput } from "../../components/ui/SearchInput";
import { cn } from "../../lib/cn";
import { labelClass, inputClass } from "../../components/ui/formClasses";
import { Mail, MailOpen, Eye, Reply as ReplyIcon, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Sortable column headers - backend whitelists these fields (message.service.ts's
  // SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = { search, sortBy, sortOrder };

  const { data } = useQuery({
    queryKey: ["messages", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<MessageRow[]>>("/messages", { params: { ...filterParams, page, limit } });
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

  const columns: { key: string; label: string; sortField?: string; render: (m: MessageRow) => ReactNode; exportValue: (m: MessageRow) => string | number | null }[] = [
    {
      key: "fromBusinessLocation",
      label: isAr ? "من" : "From",
      render: (m) => (
        <>
          {!m.readByMe && <span className="me-1.5 inline-block h-2 w-2 rounded-full bg-sky-500" aria-hidden />}
          {m.fromBusinessLocation.branchName}
        </>
      ),
      exportValue: (m) => m.fromBusinessLocation.branchName,
    },
    { key: "toBusinessLocation", label: isAr ? "إلى" : "To", render: (m) => m.toBusinessLocation.branchName, exportValue: (m) => m.toBusinessLocation.branchName },
    {
      key: "subject",
      label: isAr ? "الرسالة" : "Message",
      sortField: "subject",
      render: (m) => (
        <>
          <p className={cn("text-slate-800", !m.readByMe ? "font-semibold" : "font-medium")}>{m.subject}</p>
          <p className="line-clamp-1 text-xs text-slate-500">{m.content}</p>
        </>
      ),
      exportValue: (m) => m.subject,
    },
    { key: "createdByUser", label: isAr ? "بواسطة" : "By", render: (m) => <span className="text-slate-500">{m.createdByUser.fullNameEn}</span>, exportValue: (m) => m.createdByUser.fullNameEn },
  ];

  const columnVisibility = useColumnVisibility(
    "messages",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

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
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "الرسائل" : "Messages"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<MessageRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<MessageRow[]>>("/messages", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((m) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(m)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              {visibleColumns.map((c) =>
                c.sortField ? (
                  <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                    {c.label}
                  </SortableTh>
                ) : (
                  <Th key={c.key}>{c.label}</Th>
                ),
              )}
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((m) => (
              <tr key={m.id} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/60", !m.readByMe && "bg-sky-50/60")}>
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(m)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <RowActions>
                    <RowActionButton icon={Eye} label={isAr ? "عرض" : "Show"} onClick={() => viewMutation.mutate(m.id)} />
                    <RowActionButton
                      icon={ReplyIcon}
                      label={isAr ? "رد" : "Reply"}
                      onClick={() => {
                        setReplyTo(m);
                        setComposeOpen(true);
                      }}
                    />
                    <RowActionButton
                      icon={Trash2}
                      label={isAr ? "حذف" : "Delete"}
                      variant="danger"
                      onClick={async () => {
                        if (await confirmAction({ message: isAr ? "حذف هذه الرسالة؟" : "Delete this message?", danger: true })) deleteMutation.mutate(m.id);
                      }}
                    />
                  </RowActions>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}

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
