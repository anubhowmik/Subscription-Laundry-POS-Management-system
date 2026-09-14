import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { X, CheckCircle2, Ban, Gift, CalendarClock, Eye, Printer, RefreshCw, Trash2, Pencil, Link2, Mail } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrentApp } from "../../components/layout/Sidebar";
import {
  usePaymentMethods,
  useCustomers,
  useQuotes,
  useDeliveries,
  useConfirmQuote,
  useVoidQuote,
  useDeleteQuotePermanently,
  useShareUrl,
  useSendQuoteNotification,
  BNPL_CODES,
  type QuoteRow,
  type CheckoutPaymentInput,
} from "../../api/posApi";
import { roundMoney } from "../../stores/posStore";
import { confirmAction } from "../../stores/confirmStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh, RowActions, RowActionButton, RowActionLink } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu, FiltersMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { inputClass, selectClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { FileText } from "lucide-react";
import { BnplFlowModal } from "../../components/pos/BnplFlowModal";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";

interface Props {
  /** "delivery" reuses this exact page for the reference's own "List Deliveries" (the same
   * DRAFT-sale mechanism as a Quote, just isQuotation=false - see Sale.isQuotation's schema
   * comment) instead of duplicating a second, near-identical list page. Defaults to "quotation",
   * today's exact unchanged behavior. */
  kind?: "quotation" | "delivery";
}

export default function QuotesPage({ kind = "quotation" }: Props) {
  const isDelivery = kind === "delivery";
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const currentApp = useCurrentApp();
  const { currentLocation, locations } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  // Reference's own "Edit" branches on is_direct_sale (SellController@edit's table-style form vs
  // SellPosController@edit's POS-grid form) - this app's equivalent is Sale.channel: an
  // "ADD_SALE" draft reopens /sales/create, a "POS" draft reopens the mode-correct grid screen.
  // The mode-aware /pos vs /pos/service vs /pos/product branch mirrors SalesPage.tsx's own
  // posRoute fix (a hardcoded "/pos" 404s or silently mis-scopes for a Service-POS-only/
  // Product-POS-only role with no access to the plain /pos route).
  function editTarget(q: QuoteRow) {
    if (q.channel === "ADD_SALE") return `/sales/create?editQuoteId=${q.id}`;
    if (currentApp?.key === "posService") return `/pos/service?editQuoteId=${q.id}`;
    if (currentApp?.key === "posProduct") return `/pos/product?editQuoteId=${q.id}`;
    return `/pos?editQuoteId=${q.id}`;
  }

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Backend already whitelists these fields (pos.service.ts's listQuotes -> QUOTE_SORTABLE_FIELDS).
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Filters converted column-for-column from the reference's own draft.blade.php (Deliveries) /
  // quotations.blade.php (Quotations): both share Business Location, Customer, Date Range, Created
  // By. Customer Group is draft.blade.php-only (Deliveries) - quotations.blade.php has no such
  // filter, a genuine difference between the two pages, not an oversight (see the columns array
  // below). The reference's Shipping Status filter (laundry-only, present in BOTH files) is
  // deliberately NOT built for either - this app's Sale model has no shipping/order-status field
  // yet (a queued, not-yet-built laundry-workflow item) - so it's left off rather than faked.
  const [businessLocationId, setBusinessLocationId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [customerGroupId, setCustomerGroupId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; nameEn: string; nameAr: string | null } | null>(null);
  const activeFilterCount =
    (businessLocationId ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0) + (createdBy ? 1 : 0) + (isDelivery && customerGroupId ? 1 : 0) + (pickedCustomer ? 1 : 0);
  function clearAllFilters() {
    setBusinessLocationId("");
    setFromDate("");
    setToDate("");
    setCreatedBy("");
    setCustomerGroupId("");
    setCustomerSearch("");
    setPickedCustomer(null);
    setPage(1);
  }
  const { data: staffUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });
  const { data: customerGroups } = useQuery({
    queryKey: ["customer-groups", "all"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; nameEn: string; nameAr: string | null }[]>>("/customer-groups", { params: { limit: 100 } })).data.data,
    enabled: isDelivery,
  });
  const { data: customerResults } = useCustomers(customerSearch);

  const columns: { key: string; label: string; sortField?: string; render: (q: QuoteRow) => ReactNode; exportValue: (q: QuoteRow) => string | number | null }[] = [
    isDelivery
      ? { key: "deliveryNumber", label: isAr ? "رقم التسليم" : "Delivery #", sortField: "deliveryNumber", render: (q) => <span className="ltr-nums">{q.deliveryNumber}</span>, exportValue: (q) => q.deliveryNumber }
      : { key: "quoteNumber", label: isAr ? "رقم العرض" : "Quote #", sortField: "quoteNumber", render: (q) => <span className="ltr-nums">{q.quoteNumber}</span>, exportValue: (q) => q.quoteNumber },
    {
      key: "customerName",
      label: t("common.name"),
      render: (q) => (isAr ? q.customer.nameAr || q.customer.nameEn : q.customer.nameEn),
      exportValue: (q) => (isAr ? q.customer.nameAr || q.customer.nameEn : q.customer.nameEn),
    },
    // Reference's own draft.blade.php (List Deliveries) has a Customer Group column; its
    // quotations.blade.php (List Quotations) does not - a genuine difference between the two
    // pages, not an oversight, so this column only renders for the "delivery" kind.
    ...(isDelivery
      ? [
          {
            key: "customerGroup",
            label: isAr ? "مجموعة العملاء" : "Customer Group",
            render: (q: QuoteRow) => (q.customer.customerGroup ? (isAr ? q.customer.customerGroup.nameAr || q.customer.customerGroup.nameEn : q.customer.customerGroup.nameEn) : "—"),
            exportValue: (q: QuoteRow) => q.customer.customerGroup?.nameEn ?? null,
          },
        ]
      : []),
    {
      key: "contactNo",
      label: isAr ? "رقم التواصل" : "Contact No.",
      render: (q) => <span className="ltr-nums">{q.customer.phone}</span>,
      exportValue: (q) => q.customer.phone,
    },
    { key: "createdAt", label: isAr ? "التاريخ" : "Date", sortField: "createdAt", render: (q) => <span className="ltr-nums">{formatDate(q.createdAt, locale)}</span>, exportValue: (q) => formatDate(q.createdAt, locale) },
    {
      key: "location",
      label: isAr ? "الفرع" : "Location",
      render: (q) => q.businessLocation.branchName,
      exportValue: (q) => q.businessLocation.branchName,
    },
    { key: "items", label: isAr ? "الأصناف" : "Items", render: (q) => `${q.items.length} ${isAr ? "صنف" : "items"}`, exportValue: (q) => q.items.length },
    { key: "totalAmount", label: t("pos.total"), sortField: "totalAmount", render: (q) => <span className="ltr-nums">{formatMoney(q.totalAmount, currency, locale)}</span>, exportValue: (q) => Number(q.totalAmount) },
    { key: "addedBy", label: isAr ? "أضيف بواسطة" : "Added By", render: (q) => q.createdByUser.fullNameEn, exportValue: (q) => q.createdByUser.fullNameEn },
  ];

  const columnVisibility = useColumnVisibility(
    isDelivery ? "deliveries" : "quotes",
    columns.map((c) => c.key),
  );
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    sortBy,
    sortOrder,
    ...(businessLocationId ? { businessLocationId } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(isDelivery && customerGroupId ? { customerGroupId } : {}),
    ...(pickedCustomer ? { customerId: pickedCustomer.id } : {}),
  };

  const quotesResult = useQuotes({ page, limit, ...filterParams }, !isDelivery);
  const deliveriesResult = useDeliveries({ page, limit, ...filterParams }, isDelivery);
  const { data } = isDelivery ? deliveriesResult : quotesResult;
  const voidQuote = useVoidQuote();
  const deleteQuote = useDeleteQuotePermanently();
  const confirmQuoteToInvoice = useConfirmQuote();
  const shareUrl = useShareUrl();
  const [confirmingQuote, setConfirmingQuote] = useState<QuoteRow | null>(null);
  const [viewingQuoteId, setViewingQuoteId] = useState<string | null>(null);
  const [shareUrlValue, setShareUrlValue] = useState<string | null>(null);
  const [notifyingQuote, setNotifyingQuote] = useState<QuoteRow | null>(null);

  const pageTitle = isDelivery ? (isAr ? "التسليمات" : "Deliveries") : isAr ? "عروض الأسعار" : "Quotes";
  const apiPath = isDelivery ? "/pos/deliveries" : "/pos/quotes";

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle} />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={FileText}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={pageTitle}
          value={String(data?.meta?.total ?? 0)}
        />
      </div>

      <TableContainer>
        <TableToolbar>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Business Location"}</label>
              <select
                value={businessLocationId}
                onChange={(e) => {
                  setBusinessLocationId(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "العميل" : "Customer"}</label>
              <input
                value={pickedCustomer ? (isAr ? pickedCustomer.nameAr || pickedCustomer.nameEn : pickedCustomer.nameEn) : customerSearch}
                onChange={(e) => {
                  setPickedCustomer(null);
                  setCustomerSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={isAr ? "أي عميل" : "Any customer"}
                className={cn(inputClass, "w-full")}
              />
              {customerSearch && !pickedCustomer && (customerResults?.length ?? 0) > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {customerResults!.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setPickedCustomer(c);
                        setCustomerSearch("");
                        setPage(1);
                      }}
                      className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
                    >
                      {isAr ? c.nameAr || c.nameEn : c.nameEn} <span className="ltr-nums text-xs text-slate-400">({c.phone})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من" : "From"}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى" : "To"}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المستخدم" : "User"}</label>
              <select
                value={createdBy}
                onChange={(e) => {
                  setCreatedBy(e.target.value);
                  setPage(1);
                }}
                className={cn(selectClass, "w-full")}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(staffUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullNameEn}
                  </option>
                ))}
              </select>
            </div>
            {isDelivery && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "مجموعة العملاء" : "Customer Group"}</label>
                <select
                  value={customerGroupId}
                  onChange={(e) => {
                    setCustomerGroupId(e.target.value);
                    setPage(1);
                  }}
                  className={cn(selectClass, "w-full")}
                >
                  <option value="">{isAr ? "الكل" : "All"}</option>
                  {(customerGroups ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {isAr ? g.nameAr || g.nameEn : g.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </FiltersMenu>
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
              title={pageTitle}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<QuoteRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<QuoteRow[]>>(apiPath, {
                    params: { ...filterParams, page: p, limit: l },
                  });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((q) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(q)])));
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
            {data?.rows.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {visibleColumns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {c.render(q)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <RowActions>
                    <RowActionButton icon={Eye} label={isAr ? "عرض" : "View"} variant="default" onClick={() => setViewingQuoteId(q.id)} />
                    {can("sales.update") && <RowActionLink icon={Pencil} label={isAr ? "تعديل" : "Edit"} variant="default" to={editTarget(q)} />}
                    <RowActionLink icon={Printer} label={isAr ? "طباعة" : "Print"} variant="default" to={`/invoices/${q.id}`} target="_blank" rel="noopener noreferrer" />
                    <RowActionButton icon={CheckCircle2} label={isAr ? "تأكيد ودفع" : "Confirm & Checkout"} variant="success" onClick={() => setConfirmingQuote(q)} />
                    <RowActionButton
                      icon={RefreshCw}
                      label={isAr ? "تحويل إلى فاتورة" : "Convert to Invoice"}
                      variant="default"
                      onClick={async () => {
                        const message = isDelivery
                          ? isAr
                            ? "تحويل هذا التسليم إلى فاتورة دون تحصيل دفعة الآن؟"
                            : "Convert this delivery to an invoice without collecting payment now?"
                          : isAr
                            ? "تحويل عرض السعر هذا إلى فاتورة دون تحصيل دفعة الآن؟"
                            : "Convert this quote to an invoice without collecting payment now?";
                        if (await confirmAction({ message })) confirmQuoteToInvoice.mutate({ id: q.id, payments: [] });
                      }}
                      disabled={confirmQuoteToInvoice.isPending}
                    />
                    <RowActionButton
                      icon={Ban}
                      label={isAr ? "إلغاء" : "Void"}
                      variant="danger"
                      onClick={async () => {
                        const message = isDelivery
                          ? isAr
                            ? "إلغاء هذا التسليم؟"
                            : "Void this delivery?"
                          : isAr
                            ? "إلغاء عرض السعر هذا؟"
                            : "Void this quote?";
                        if (await confirmAction({ message, danger: true })) voidQuote.mutate(q.id);
                      }}
                      disabled={voidQuote.isPending}
                    />
                    {can("sales.delete") && (
                      <RowActionButton
                        icon={Trash2}
                        label={isAr ? "حذف نهائي" : "Delete"}
                        variant="danger"
                        onClick={async () => {
                          const message = isDelivery
                            ? isAr
                              ? "حذف هذا التسليم نهائيًا؟ لا يمكن التراجع عن هذا."
                              : "Permanently delete this delivery? This can't be undone."
                            : isAr
                              ? "حذف عرض السعر هذا نهائيًا؟ لا يمكن التراجع عن هذا."
                              : "Permanently delete this quote? This can't be undone.";
                          if (await confirmAction({ message, danger: true })) deleteQuote.mutate(q.id);
                        }}
                        disabled={deleteQuote.isPending}
                      />
                    )}
                    {/* Reference's dropdown only shows these two for `sub_status == "quotation"` -
                        a Delivery has nothing equivalent (it's a laundry intake ticket, never
                        emailed/shared as a standalone document the way a price quote is). */}
                    {!isDelivery && (
                      <RowActionButton
                        icon={Link2}
                        label={isAr ? "رابط عرض السعر" : "View Quote URL"}
                        variant="default"
                        onClick={() => shareUrl.mutate(q.id, { onSuccess: ({ token }) => setShareUrlValue(`${window.location.origin}/q/${token}`) })}
                        disabled={shareUrl.isPending}
                      />
                    )}
                    {!isDelivery && (
                      <RowActionButton
                        icon={Mail}
                        label={isAr ? "إرسال إشعار" : "Send Notification"}
                        variant="default"
                        onClick={() => setNotifyingQuote(q)}
                      />
                    )}
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

      {confirmingQuote && (
        <ConfirmQuoteModal
          isAr={isAr}
          isDelivery={isDelivery}
          currency={currency}
          locale={locale}
          quote={confirmingQuote}
          onClose={() => setConfirmingQuote(null)}
        />
      )}

      {viewingQuoteId && <SaleDetailModal saleId={viewingQuoteId} onClose={() => setViewingQuoteId(null)} />}

      {shareUrlValue && <ViewQuoteUrlModal isAr={isAr} url={shareUrlValue} onClose={() => setShareUrlValue(null)} />}

      {notifyingQuote && <SendNotificationModal isAr={isAr} quote={notifyingQuote} onClose={() => setNotifyingQuote(null)} />}
    </div>
  );
}

/** Reference's own small "View Quote URL" modal (`sale_pos/partials/invoice_url_modal.blade.php`)
 * - a read-only field with the public link plus a copy/open action, nothing more. */
function ViewQuoteUrlModal({ isAr, url, onClose }: { isAr: boolean; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={isAr ? "رابط عرض السعر" : "Quote URL"} onClose={onClose} size="sm">
      <p className="mb-2 text-xs text-slate-500">
        {isAr
          ? "شارك هذا الرابط مع العميل لعرض عرض السعر - لا حاجة لتسجيل الدخول."
          : "Share this link with the customer to view the quote - no login required."}
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className={cn(inputClass, "ltr-nums flex-1 text-xs")}
          dir="ltr"
        />
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ" : "Copy"}
        </Button>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-sky-600 underline">
        {isAr ? "فتح الرابط" : "Open link"}
      </a>
    </Modal>
  );
}

/** Reference's own "Send Notification" modal (`notification/show_template.blade.php`, opened for
 * `template_for=new_quotation`) - simplified to this app's actual channels (email via whichever
 * EmailSender is configured, SMS via Unifonic) instead of the reference's Email/SMS/WhatsApp trio,
 * since this app has no WhatsApp integration anywhere (same "adapt to what actually exists" call
 * as BNPL being scoped to the 3 providers this app actually has). Each channel defaults from the
 * customer's own record but stays editable before sending, matching the reference's own behavior. */
function SendNotificationModal({ isAr, quote, onClose }: { isAr: boolean; quote: QuoteRow; onClose: () => void }) {
  const sendNotification = useSendQuoteNotification();
  const [emailOn, setEmailOn] = useState(Boolean(quote.customer.email));
  const [email, setEmail] = useState(quote.customer.email ?? "");
  const [smsOn, setSmsOn] = useState(!quote.customer.email);
  const [mobile, setMobile] = useState(quote.customer.phone);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    setError(null);
    if (!emailOn && !smsOn) {
      setError(isAr ? "اختر قناة واحدة على الأقل" : "Choose at least one channel");
      return;
    }
    sendNotification.mutate(
      { id: quote.id, input: { email: emailOn ? email : undefined, mobile: smsOn ? mobile : undefined } },
      {
        onSuccess: () => setSent(true),
        onError: (err) =>
          setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "تعذّر الإرسال" : "Could not send") : isAr ? "تعذّر الإرسال" : "Could not send"),
      },
    );
  }

  return (
    <Modal
      title={isAr ? "إرسال إشعار عرض السعر" : "Send Quotation Notification"}
      onClose={onClose}
      size="sm"
      footer={
        sent ? (
          <Button variant="outline" fullWidth onClick={onClose}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        ) : (
          <Button fullWidth onClick={submit} disabled={sendNotification.isPending}>
            {sendNotification.isPending ? "…" : isAr ? "إرسال" : "Send"}
          </Button>
        )
      }
    >
      {sent ? (
        <Alert variant="success">{isAr ? "تم إرسال الإشعار." : "Notification sent."}</Alert>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={emailOn} onChange={(e) => setEmailOn(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
            {isAr ? "البريد الإلكتروني" : "Email"}
          </label>
          {emailOn && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isAr ? "بريد العميل الإلكتروني" : "Customer's email"}
              className={cn(inputClass, "w-full")}
              dir="ltr"
            />
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
            {isAr ? "رسالة نصية" : "SMS"}
          </label>
          {smsOn && (
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder={isAr ? "رقم جوال العميل" : "Customer's mobile"}
              className={cn(inputClass, "ltr-nums w-full")}
              dir="ltr"
            />
          )}

          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function ConfirmQuoteModal({
  isAr,
  isDelivery,
  currency,
  locale,
  quote,
  onClose,
}: {
  isAr: boolean;
  isDelivery: boolean;
  currency: string;
  locale: string;
  quote: QuoteRow;
  onClose: () => void;
}) {
  const { data: paymentMethods } = usePaymentMethods();
  const confirmQuote = useConfirmQuote();
  const [payments, setPayments] = useState<(CheckoutPaymentInput & { id: string; label: string; locked?: boolean })[]>([]);
  const [appliedCreditAmount, setAppliedCreditAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bnplOpen, setBnplOpen] = useState(false);

  const totalAmount = Number(quote.totalAmount);
  const availableCredit = Number(quote.customer.balance) < 0 ? -Number(quote.customer.balance) : 0;
  const paid = roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));
  const dueBeforeCredit = roundMoney(Math.max(0, totalAmount - paid));
  const cappedCredit = roundMoney(Math.min(appliedCreditAmount, dueBeforeCredit, availableCredit));
  // Rounded here (not just at display) since this exact value gets submitted as a payment amount
  // by the auto-fill buttons below - see the identical fix in posStore.ts's selectTotals().
  const due = roundMoney(Math.max(0, dueBeforeCredit - cappedCredit));

  function submit() {
    setError(null);
    confirmQuote.mutate(
      {
        id: quote.id,
        payments: payments.map((p) => ({ paymentMethodId: p.paymentMethodId, amount: p.amount, referenceNumber: p.referenceNumber })),
        appliedCreditAmount: cappedCredit > 0 ? cappedCredit : undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) =>
          setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
      },
    );
  }

  return (
    <Modal
      title={
        <>
          {isDelivery ? (isAr ? "تأكيد التسليم" : "Confirm Delivery") : isAr ? "تأكيد عرض السعر" : "Confirm Quote"}{" "}
          <span className="ltr-nums">{isDelivery ? quote.deliveryNumber : quote.quoteNumber}</span>
        </>
      }
      onClose={onClose}
      size="sm"
      footer={
        <Button variant="primary" fullWidth className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800" onClick={submit} disabled={confirmQuote.isPending}>
          {confirmQuote.isPending ? "…" : isAr ? "تأكيد البيع" : "Confirm Sale"}
        </Button>
      }
    >
      <div className="mb-3 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">{isAr ? "الإجمالي" : "Total"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(totalAmount, currency, locale)}</span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {/* Same tender-tile filtering as the touch-grid POS's PaymentModal (InvoicePanel.tsx) -
            Cashback and BNPL get their own dedicated controls below instead of a plain tile, since
            both need special handling (a capped/locked amount, or a multi-step session flow) that
            a generic "add the full due amount" tile can't provide. */}
        {paymentMethods?.filter((m) => m.code !== "STORE_CREDIT" && m.code !== "CASHBACK" && !BNPL_CODES.includes(m.code)).map((m) => (
          <Button
            key={m.id}
            variant="outline"
            onClick={() =>
              setPayments((prev) => [
                ...prev,
                { id: crypto.randomUUID?.() ?? String(Math.random()), paymentMethodId: m.id, label: isAr ? m.nameAr : m.nameEn, amount: due },
              ])
            }
            disabled={due <= 0}
          >
            {isAr ? m.nameAr : m.nameEn}
          </Button>
        ))}
        {Number(quote.customer.cashBack) > 0 &&
          (() => {
            const cashbackMethod = paymentMethods?.find((m) => m.code === "CASHBACK");
            if (!cashbackMethod) return null;
            const cashbackAmount = roundMoney(Math.min(due, Number(quote.customer.cashBack)));
            return (
              <button
                key={cashbackMethod.id}
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID?.() ?? String(Math.random()),
                      paymentMethodId: cashbackMethod.id,
                      label: isAr ? cashbackMethod.nameAr : cashbackMethod.nameEn,
                      amount: cashbackAmount,
                      locked: true,
                    },
                  ])
                }
                disabled={due <= 0}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Gift className="h-4 w-4" strokeWidth={2} aria-hidden />
                {isAr ? cashbackMethod.nameAr : cashbackMethod.nameEn}
                <span className="ltr-nums text-xs text-amber-500">({formatMoney(quote.customer.cashBack, currency, locale)})</span>
              </button>
            );
          })()}
        <button
          onClick={() => setBnplOpen(true)}
          disabled={due <= 0}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden />
          {isAr ? "دفع آجل" : "Pay Later"}
        </button>
      </div>

      {payments.map((p) => (
        <div key={p.id} className="mb-1 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm">
          <span>{p.label}</span>
          <span className="ltr-nums">{formatMoney(p.amount, currency, locale)}</span>
          <button onClick={() => setPayments((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ))}

      {availableCredit > 0 && (
        <div className="mt-2 rounded-lg bg-emerald-50 p-2">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span>{isAr ? "الرصيد المتاح" : "Store Credit Available"}</span>
            <span className="ltr-nums">{formatMoney(availableCredit, currency, locale)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={Math.min(availableCredit, dueBeforeCredit)}
              value={appliedCreditAmount || ""}
              onChange={(e) => setAppliedCreditAmount(Number(e.target.value))}
              placeholder="0.00"
              className={cn(inputClass, "ltr-nums !border-emerald-200 focus:!border-emerald-500 focus:!ring-emerald-500/30")}
            />
            <Button
              size="sm"
              className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800 shrink-0"
              onClick={() => setAppliedCreditAmount(dueBeforeCredit)}
            >
              {isAr ? "تطبيق الكل" : "Apply Max"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-sm">
        <span className="text-slate-500">{isAr ? "المتبقي" : "Due"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(due, currency, locale)}</span>
      </div>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}

      {bnplOpen && (
        <BnplFlowModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          businessLocationId={quote.businessLocationId}
          paymentMethods={paymentMethods ?? []}
          customer={{ id: quote.customer.id, phone: quote.customer.phone }}
          due={due}
          onAddPayment={(p) => setPayments((prev) => [...prev, { id: crypto.randomUUID?.() ?? String(Math.random()), ...p }])}
          notify={setError}
          onClose={() => setBnplOpen(false)}
        />
      )}
    </Modal>
  );
}
