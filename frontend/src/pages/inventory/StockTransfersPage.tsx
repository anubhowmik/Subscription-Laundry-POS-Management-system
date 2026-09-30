import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { Plus, PackageCheck, XCircle } from "lucide-react";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Table, THead, Th, RowActions, RowActionButton } from "../../components/ui/Table";
import { FiltersMenu } from "../../components/ui/TableToolbarControls";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";

interface StockTransferRow {
  id: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  fromBusinessLocationId: string;
  toBusinessLocationId: string;
  quantitySent: string;
  quantityReceived: string | null;
  driverName: string | null;
  vehicleNumber: string | null;
  shipNote: string | null;
  receiveNote: string | null;
  shippedAt: string;
  receivedAt: string | null;
  product: { nameEn: string; nameAr: string; sku: string };
  fromBusinessLocation: { branchName: string };
  toBusinessLocation: { branchName: string };
  createdByUser: { fullNameEn: string } | null;
  receivedByUser: { fullNameEn: string } | null;
}

const STATUS_LABEL: Record<string, { en: string; ar: string; variant: "success" | "danger" | "neutral" }> = {
  IN_TRANSIT: { en: "In Transit", ar: "قيد النقل", variant: "neutral" },
  RECEIVED: { en: "Received", ar: "مستلم", variant: "success" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", variant: "danger" },
};

export default function StockTransfersPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { locations } = useBusinessLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const activeFilterCount =
    (fromLocationId ? 1 : 0) + (toLocationId ? 1 : 0) + (status ? 1 : 0) + (createdBy ? 1 : 0) + (fromDate ? 1 : 0) + (toDate ? 1 : 0);
  function clearAllFilters() {
    setFromLocationId("");
    setToLocationId("");
    setStatus("");
    setCreatedBy("");
    setFromDate("");
    setToDate("");
  }

  const { data: staffUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });

  const filterParams = {
    ...(fromLocationId ? { fromBusinessLocationId: fromLocationId } : {}),
    ...(toLocationId ? { toBusinessLocationId: toLocationId } : {}),
    ...(status ? { status } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  };

  const { data } = useQuery({
    queryKey: ["stock-transfers", filterParams],
    queryFn: async () => (await api.get<ApiSuccess<StockTransferRow[]>>("/inventory/transfers", { params: { ...filterParams, limit: 50 } })).data.data,
  });

  const locationIds = new Set(locations.map((l) => l.id));

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["stock-transfers"] });
    qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "تحويلات المخزون" : "Stock Transfers"}
        actions={
          <Button onClick={() => navigate("/stock-transfers/create")}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden /> {isAr ? "إضافة تحويل مخزون" : "Add Stock Transfer"}
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{isAr ? "قائمة تحويلات المخزون" : "List Stock Transfers"}</CardTitle>
          <FiltersMenu activeCount={activeFilterCount} onClear={clearAllFilters} isAr={isAr}>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من فرع" : "Location From"}</label>
              <select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى فرع" : "Location To"}</label>
              <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.branchName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الحالة" : "Status"}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {Object.entries(STATUS_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {isAr ? label.ar : label.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المستخدم" : "User"}</label>
              <select value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(staffUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullNameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "من تاريخ" : "Date From"}</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "إلى تاريخ" : "Date To"}</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={cn(inputClass, "w-full ltr-nums")} />
            </div>
          </FiltersMenu>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <Th>{isAr ? "المنتج" : "Product"}</Th>
                <Th>{isAr ? "من" : "From"}</Th>
                <Th>{isAr ? "إلى" : "To"}</Th>
                <Th>{isAr ? "الكمية المرسلة" : "Qty Sent"}</Th>
                <Th>{isAr ? "السائق" : "Driver"}</Th>
                <Th>{isAr ? "تاريخ الشحن" : "Shipped"}</Th>
                <Th>{isAr ? "الحالة" : "Status"}</Th>
                <Th>{isAr ? "إجراءات" : "Actions"}</Th>
              </tr>
            </THead>
            <tbody>
              {data?.map((tr) => (
                <TransferRow
                  key={tr.id}
                  transfer={tr}
                  isAr={isAr}
                  canReceive={tr.status === "IN_TRANSIT" && locationIds.has(tr.toBusinessLocationId)}
                  canCancel={tr.status === "IN_TRANSIT" && locationIds.has(tr.fromBusinessLocationId)}
                  expanded={expandedId === tr.id}
                  onToggle={() => setExpandedId(expandedId === tr.id ? null : tr.id)}
                  onDone={() => {
                    setExpandedId(null);
                    invalidate();
                  }}
                />
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    {isAr ? "لا توجد تحويلات" : "No stock transfers"}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function TransferRow({
  transfer,
  isAr,
  canReceive,
  canCancel,
  expanded,
  onToggle,
  onDone,
}: {
  transfer: StockTransferRow;
  isAr: boolean;
  canReceive: boolean;
  canCancel: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [quantityReceived, setQuantityReceived] = useState(transfer.quantitySent);
  const [receiveNote, setReceiveNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const receiveMutation = useMutation({
    mutationFn: async () =>
      api.post(`/inventory/transfers/${transfer.id}/receive`, {
        quantityReceived: Number(quantityReceived),
        receiveNote: receiveNote || undefined,
      }),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/inventory/transfers/${transfer.id}/cancel`),
    onSuccess: onDone,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  return (
    <>
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
        <td className="px-4 py-3">
          {isAr ? transfer.product.nameAr || transfer.product.nameEn : transfer.product.nameEn}{" "}
          <span className="ltr-nums text-xs text-slate-400">({transfer.product.sku})</span>
        </td>
        <td className="px-4 py-3">{transfer.fromBusinessLocation.branchName}</td>
        <td className="px-4 py-3">{transfer.toBusinessLocation.branchName}</td>
        <td className="px-4 py-3"><span className="ltr-nums">{transfer.quantitySent}</span></td>
        <td className="px-4 py-3 text-slate-500">{transfer.driverName ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(transfer.shippedAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_LABEL[transfer.status].variant}>{isAr ? STATUS_LABEL[transfer.status].ar : STATUS_LABEL[transfer.status].en}</Badge>
        </td>
        <td className="px-4 py-3">
          <RowActions>
            {canReceive && <RowActionButton icon={PackageCheck} label={isAr ? "استلام" : "Receive"} variant="success" onClick={onToggle} />}
            {canCancel && (
              <RowActionButton
                icon={XCircle}
                label={isAr ? "إلغاء" : "Cancel"}
                variant="danger"
                disabled={cancelMutation.isPending}
                onClick={async () => {
                  if (await confirmAction({ message: isAr ? "إلغاء هذا التحويل؟" : "Cancel this transfer?", danger: true })) cancelMutation.mutate();
                }}
              />
            )}
          </RowActions>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelClass}>{isAr ? "الكمية المستلمة" : "Quantity Received"}</label>
                <input type="number" min={0} value={quantityReceived} onChange={(e) => setQuantityReceived(e.target.value)} className={cn(inputClass, "ltr-nums")} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>{isAr ? "ملاحظة الاستلام" : "Receive Note"}</label>
                <input value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} className={inputClass} />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setError(null);
                    receiveMutation.mutate();
                  }}
                  disabled={receiveMutation.isPending || Number(quantityReceived) < 0}
                  fullWidth
                >
                  {receiveMutation.isPending ? "…" : isAr ? "تأكيد الاستلام" : "Confirm Receipt"}
                </Button>
              </div>
              {error && (
                <Alert variant="danger" className="sm:col-span-4">
                  {error}
                </Alert>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
