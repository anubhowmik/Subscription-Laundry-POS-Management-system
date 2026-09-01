import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { confirmAction } from "../../stores/confirmStore";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { usePriceLists } from "../../api/posApi";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";
import { UsersRound } from "lucide-react";

interface CustomerGroupRow {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  discountPercent: string;
  creditLimit: string;
  paymentTermsDays: number;
  priceListId: string | null;
  maxAmountPerMonth: string | null;
  maxInvoicesPerMonth: number | null;
  maxQtyPerMonth: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export default function CustomerGroupsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerGroupRow | null>(null);

  const { data } = useQuery({
    queryKey: ["customer-groups", search],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CustomerGroupRow[]>>("/customer-groups", { params: { search: search || undefined, limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const { data: priceLists } = usePriceLists();

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/customer-groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-groups"] }),
  });

  function priceListName(id: string | null) {
    if (!id) return "—";
    const pl = priceLists?.find((p) => p.id === id);
    if (!pl) return "—";
    return isAr ? pl.nameAr || pl.nameEn : pl.nameEn;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? "مجموعات العملاء" : "Customer Groups"}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + {isAr ? "مجموعة جديدة" : "Add Group"}
          </Button>
        }
      />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard
            icon={UsersRound}
            cardBg="bg-sky-500"
            iconBg="bg-white/20"
            iconColor="text-white"
            highlight
            label={isAr ? "مجموعات العملاء" : "Customer Groups"}
            value={String(data.meta.total)}
          />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search")} className="max-w-xs" />
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "الاسم" : "Name"}</Th>
              <Th>{isAr ? "نسبة الخصم" : "Discount %"}</Th>
              <Th>{isAr ? "حد الائتمان" : "Credit Limit"}</Th>
              <Th>{isAr ? "شروط الدفع (يوم)" : "Payment Terms (days)"}</Th>
              <Th>{isAr ? "قائمة الأسعار" : "Price List"}</Th>
              <Th>{t("common.status")}</Th>
              <Th className="text-end">{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium">{isAr ? g.nameAr || g.nameEn : g.nameEn}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{g.discountPercent}%</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{g.creditLimit}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{g.paymentTermsDays}</span></td>
                <td className="px-4 py-3">{priceListName(g.priceListId)}</td>
                <td className="px-4 py-3">
                  <Badge variant={g.status === "ACTIVE" ? "success" : "neutral"}>
                    {g.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(g);
                        setFormOpen(true);
                      }}
                    >
                      {isAr ? "تعديل" : "Edit"}
                    </Button>
                    {g.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (await confirmAction({ message: isAr ? `تعطيل "${g.nameEn}"؟` : `Deactivate "${g.nameEn}"?`, danger: true })) deactivateMutation.mutate(g.id);
                        }}
                      >
                        {isAr ? "تعطيل" : "Deactivate"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableScroll>
      </TableContainer>

      {formOpen && (
        <GroupFormModal
          isAr={isAr}
          editing={editing}
          priceLists={priceLists ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function GroupFormModal({
  isAr,
  editing,
  priceLists,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: CustomerGroupRow | null;
  priceLists: { id: string; nameEn: string; nameAr: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [discountPercent, setDiscountPercent] = useState(editing?.discountPercent ?? "0");
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? "0");
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(editing?.paymentTermsDays ?? 0));
  const [priceListId, setPriceListId] = useState(editing?.priceListId ?? "");
  const [maxAmountPerMonth, setMaxAmountPerMonth] = useState(editing?.maxAmountPerMonth ?? "");
  const [maxInvoicesPerMonth, setMaxInvoicesPerMonth] = useState(editing?.maxInvoicesPerMonth != null ? String(editing.maxInvoicesPerMonth) : "");
  const [maxQtyPerMonth, setMaxQtyPerMonth] = useState(editing?.maxQtyPerMonth ?? "");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nameEn,
        nameAr,
        discountPercent: Number(discountPercent || 0),
        creditLimit: Number(creditLimit || 0),
        paymentTermsDays: Number(paymentTermsDays || 0),
        priceListId: priceListId || null,
        maxAmountPerMonth: maxAmountPerMonth ? Number(maxAmountPerMonth) : null,
        maxInvoicesPerMonth: maxInvoicesPerMonth ? Number(maxInvoicesPerMonth) : null,
        maxQtyPerMonth: maxQtyPerMonth ? Number(maxQtyPerMonth) : null,
      };
      if (editing) return api.put(`/customer-groups/${editing.id}`, payload);
      return api.post("/customer-groups", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-groups"] });
      onSaved();
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
    },
  });

  const canSubmit = nameEn.trim().length > 0 && nameAr.trim().length > 0;

  return (
    <Modal
      title={editing ? (isAr ? "تعديل المجموعة" : "Edit Group") : isAr ? "مجموعة جديدة" : "Add Group"}
      onClose={onClose}
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoFocus className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>{isAr ? "خصم %" : "Discount %"}</label>
            <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "حد الائتمان" : "Credit Limit"}</label>
            <input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "شروط الدفع" : "Terms (days)"}</label>
            <input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "قائمة الأسعار" : "Price List"}</label>
          <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)} className={selectClass}>
            <option value="">{isAr ? "بلا" : "None"}</option>
            {priceLists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className={labelClass}>{isAr ? "الحدود الشهرية للمجموعة (اختياري)" : "Monthly group caps (optional)"}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "المبلغ" : "Amount"}</label>
              <input type="number" min={0} value={maxAmountPerMonth} onChange={(e) => setMaxAmountPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الفواتير" : "Invoices"}</label>
              <input type="number" min={0} value={maxInvoicesPerMonth} onChange={(e) => setMaxInvoicesPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الكمية" : "Quantity"}</label>
              <input type="number" min={0} value={maxQtyPerMonth} onChange={(e) => setMaxQtyPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inputClass} />
            </div>
          </div>
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      <Button
        fullWidth
        className="mt-4"
        onClick={() => {
          setError(null);
          saveMutation.mutate();
        }}
        disabled={!canSubmit || saveMutation.isPending}
      >
        {saveMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
      </Button>
    </Modal>
  );
}
