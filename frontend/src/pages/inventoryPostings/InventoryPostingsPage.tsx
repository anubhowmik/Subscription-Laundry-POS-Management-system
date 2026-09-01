import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Modal } from "../../components/ui/Modal";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { ClipboardCheck } from "lucide-react";

interface PostingRow {
  id: string;
  postingDate: string;
  status: "PENDING" | "CONFIRMED";
  cashInDrawer: string;
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
}

export default function InventoryPostingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["inventory-postings"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PostingRow[]>>("/inventory-postings", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "جرد المخزون" : "Inventory Counting"}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            + {isAr ? "تسجيل جرد جديد" : "New Posting"}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={ClipboardCheck}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "جرد المخزون" : "Inventory Counts"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "التاريخ" : "Date"}</Th>
              <Th>{isAr ? "الفرع" : "Branch"}</Th>
              <Th>{isAr ? "في المتجر" : "In Stock"}</Th>
              <Th>{isAr ? "في المستودع" : "In Warehouse"}</Th>
              <Th>{isAr ? "تم التسليم" : "Out Stock"}</Th>
              <Th>{isAr ? "النقد بالدرج" : "Cash in Drawer"}</Th>
              <Th>{t("common.status")}</Th>
              <Th>{isAr ? "بواسطة" : "By"}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{new Date(p.postingDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-3">{p.businessLocation.branchName}</td>
                <td className="px-4 py-3">
                  <span className="ltr-nums">{p.inStockCount} <span className="text-slate-400">({formatMoney(p.inStockTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums">{p.inWarehouseCount} <span className="text-slate-400">({formatMoney(p.inWarehouseTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-3">
                  <span className="ltr-nums">{p.outStockCount} <span className="text-slate-400">({formatMoney(p.outStockTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(p.cashInDrawer, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <Badge variant={p.status === "CONFIRMED" ? "success" : "warning"}>
                    {p.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : (isAr ? "معلق" : "Pending")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">{p.createdByUser.fullNameEn}</td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableContainer>

      {formOpen && (
        <PostingFormModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["inventory-postings"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface Snapshot {
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
}

function PostingFormModal({
  isAr,
  currency,
  locale,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [cashInDrawer, setCashInDrawer] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: snapshot, isFetching } = useQuery({
    queryKey: ["posting-preview", businessLocationId],
    queryFn: async () => (await api.get<ApiSuccess<Snapshot>>("/inventory-postings/preview", { params: { businessLocationId } })).data.data,
    enabled: Boolean(businessLocationId),
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory-postings", {
        businessLocationId,
        cashInDrawer: cashInDrawer ? Number(cashInDrawer) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && Boolean(snapshot);

  return (
    <Modal
      title={isAr ? "تسجيل جرد جديد" : "New Inventory Posting"}
      onClose={onClose}
      size="lg"
      footer={
        <Button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          fullWidth
        >
          {mutation.isPending ? "…" : isAr ? "حفظ الجرد" : "Save Posting"}
        </Button>
      }
    >
      <div className="space-y-4">
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

        {isFetching && <p className="text-xs text-slate-400">{isAr ? "جارٍ الحساب..." : "Computing..."}</p>}

        {snapshot && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-xs font-semibold text-emerald-700">{isAr ? "في المتجر" : "In Stock"}</p>
              <p className="ltr-nums text-lg font-bold text-emerald-800">{snapshot.inStockCount}</p>
              <p className="ltr-nums text-xs text-emerald-600">{formatMoney(snapshot.inStockTotal, currency, locale)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-xs font-semibold text-amber-700">{isAr ? "في المستودع" : "In Warehouse"}</p>
              <p className="ltr-nums text-lg font-bold text-amber-800">{snapshot.inWarehouseCount}</p>
              <p className="ltr-nums text-xs text-amber-600">{formatMoney(snapshot.inWarehouseTotal, currency, locale)}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-xs font-semibold text-red-700">{isAr ? "تم التسليم" : "Out Stock"}</p>
              <p className="ltr-nums text-lg font-bold text-red-800">{snapshot.outStockCount}</p>
              <p className="ltr-nums text-xs text-red-600">{formatMoney(snapshot.outStockTotal, currency, locale)}</p>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>{isAr ? "النقد بالدرج" : "Cash in Drawer"}</label>
          <input type="number" min={0} value={cashInDrawer} onChange={(e) => setCashInDrawer(e.target.value)} placeholder="0" className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
