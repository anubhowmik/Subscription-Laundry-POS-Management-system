import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useCategories, useServiceCategories } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Table, THead, Th } from "../../components/ui/Table";
import { labelClass, inputClass, selectClass } from "../../components/ui/formClasses";

interface SaleRow {
  id: string;
  invoiceNumber: string | null;
  saleDate: string;
  totalAmount: string;
  itemCount?: number;
  customer: { nameEn: string; nameAr: string | null };
}

interface PostingDetail {
  id: string;
  businessLocationId: string;
  status: "PENDING" | "CONFIRMED";
  cashInDrawer: string;
  notes: string | null;
  employeeIds: string[];
  employees: { id: string; fullNameEn: string }[];
  searchDateFrom: string;
  searchDateTo: string;
  reconciledAt: string | null;
  businessLocation: { branchName: string };
  sales: { status: "IN_STOCK" | "OUT_STOCK" | "IN_WAREHOUSE"; sale: SaleRow }[];
}

type BucketKey = "IN_STOCK" | "OUT_STOCK" | "IN_WAREHOUSE";
const BUCKET_KEYS: BucketKey[] = ["IN_STOCK", "OUT_STOCK", "IN_WAREHOUSE"];
const BUCKET_LABEL: Record<BucketKey, { en: string; ar: string; cls: string }> = {
  IN_STOCK: { en: "In Stock", ar: "في المتجر", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  OUT_STOCK: { en: "Out Stock", ar: "تم التسليم", cls: "border-red-200 bg-red-50 text-red-700" },
  IN_WAREHOUSE: { en: "In Warehouse", ar: "في المستودع", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

export default function InventoryPostingFormPage() {
  const { id } = useParams<{ id: string }>();
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { locations, currentLocationId, currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const { data: productCategories } = useCategories();
  const { data: serviceCategories } = useServiceCategories();

  const { data: existing } = useQuery({
    queryKey: ["inventory-posting", id],
    queryFn: async () => (await api.get<ApiSuccess<PostingDetail>>(`/inventory-postings/${id}`)).data.data,
    enabled: Boolean(id),
  });

  const { data: allUsers } = useQuery({
    queryKey: ["users", "all-for-filter"],
    queryFn: async () => (await api.get<ApiSuccess<{ id: string; fullNameEn: string }[]>>("/users", { params: { limit: 100 } })).data.data,
  });

  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [cashInDrawer, setCashInDrawer] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serviceCategoryId, setServiceCategoryId] = useState("");
  const [searchResults, setSearchResults] = useState<SaleRow[]>([]);
  const [buckets, setBuckets] = useState<Record<BucketKey, SaleRow[]>>({ IN_STOCK: [], OUT_STOCK: [], IN_WAREHOUSE: [] });
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const isReadOnly = Boolean(existing) && existing!.status !== "PENDING";

  useEffect(() => {
    if (!existing) return;
    setBusinessLocationId(existing.businessLocationId);
    setEmployeeIds(existing.employeeIds);
    setSearchDateFrom(existing.searchDateFrom.slice(0, 10));
    setSearchDateTo(existing.searchDateTo.slice(0, 10));
    setCashInDrawer(String(existing.cashInDrawer));
    setNotes(existing.notes ?? "");
    const grouped: Record<BucketKey, SaleRow[]> = { IN_STOCK: [], OUT_STOCK: [], IN_WAREHOUSE: [] };
    for (const row of existing.sales) grouped[row.status].push(row.sale);
    setBuckets(grouped);
  }, [existing]);

  const searchMutation = useMutation({
    mutationFn: async () =>
      (
        await api.get<ApiSuccess<SaleRow[]>>("/inventory-postings/search-ready-sales", {
          params: {
            businessLocationId,
            from: searchDateFrom,
            to: searchDateTo,
            ...(categoryId ? { categoryId } : {}),
            ...(serviceCategoryId ? { serviceCategoryId } : {}),
          },
        })
      ).data.data,
    onSuccess: (rows) => {
      const classifiedIds = new Set(BUCKET_KEYS.flatMap((k) => buckets[k].map((s) => s.id)));
      setSearchResults(rows.filter((r) => !classifiedIds.has(r.id)));
      setSearched(true);
      setError(null);
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  function classify(sale: SaleRow, bucket: BucketKey) {
    setSearchResults((prev) => prev.filter((s) => s.id !== sale.id));
    setBuckets((prev) => ({ ...prev, [bucket]: [...prev[bucket], sale] }));
  }
  function unclassify(bucket: BucketKey, saleId: string) {
    setBuckets((prev) => ({ ...prev, [bucket]: prev[bucket].filter((s) => s.id !== saleId) }));
  }
  function toggleEmployee(userId: string) {
    setEmployeeIds((prev) => (prev.includes(userId) ? prev.filter((i) => i !== userId) : [...prev, userId]));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        businessLocationId,
        cashInDrawer: cashInDrawer ? Number(cashInDrawer) : undefined,
        notes: notes || undefined,
        employeeIds,
        searchDateFrom,
        searchDateTo,
        inStockSaleIds: buckets.IN_STOCK.map((s) => s.id),
        outStockSaleIds: buckets.OUT_STOCK.map((s) => s.id),
        inWarehouseSaleIds: buckets.IN_WAREHOUSE.map((s) => s.id),
      };
      return id ? api.put(`/inventory-postings/${id}`, body) : api.post("/inventory-postings", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-postings"] });
      navigate("/inventory-postings");
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const totalClassified = BUCKET_KEYS.reduce((sum, k) => sum + buckets[k].length, 0);
  const canSearch = Boolean(businessLocationId) && Boolean(searchDateFrom) && Boolean(searchDateTo);
  const canSubmit = canSearch && employeeIds.length > 0 && totalClassified > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={id ? (isAr ? "تفاصيل الجرد" : "Inventory Posting") : isAr ? "إضافة جرد" : "Add Inventory Posting"}
        actions={
          existing && (
            <div className="flex items-center gap-2">
              <Badge variant={existing.status === "CONFIRMED" ? "success" : "warning"}>
                {existing.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : isAr ? "معلق" : "Pending"}
              </Badge>
              {existing.reconciledAt && <Badge variant="neutral">{isAr ? "تمت التسوية" : "Reconciled"}</Badge>}
            </div>
          )
        }
      />

      <Card className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelClass}>{isAr ? "الفرع" : "Location"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} disabled={isReadOnly} className={selectClass}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{isAr ? "من تاريخ" : "Date From"}</label>
            <input type="date" value={searchDateFrom} onChange={(e) => setSearchDateFrom(e.target.value)} disabled={isReadOnly} className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "إلى تاريخ" : "Date To"}</label>
            <input type="date" value={searchDateTo} onChange={(e) => setSearchDateTo(e.target.value)} disabled={isReadOnly} className={cn(inputClass, "ltr-nums")} />
          </div>
          <div>
            <label className={labelClass}>{isAr ? "النقد بالدرج" : "Cash in Drawer"}</label>
            <input type="number" min={0} value={cashInDrawer} onChange={(e) => setCashInDrawer(e.target.value)} disabled={isReadOnly} placeholder="0" className={cn(inputClass, "ltr-nums")} />
          </div>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "الموظفون" : "Employees"}</label>
          <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {(allUsers ?? []).map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={employeeIds.includes(u.id)}
                  disabled={isReadOnly}
                  onChange={() => toggleEmployee(u.id)}
                />
                {u.fullNameEn}
              </label>
            ))}
            {isReadOnly &&
              existing!.employees.length === 0 && <span className="text-xs text-slate-400">{isAr ? "لا يوجد" : "None"}</span>}
          </div>
        </div>

        <div>
          <label className={labelClass}>{isAr ? "ملاحظات" : "Notes"}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReadOnly} rows={2} className={cn(inputClass, "resize-none")} />
        </div>
      </Card>

      {!isReadOnly && (
        <Card className="space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass}>{isAr ? "فئة المنتج" : "Product Category"}</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(productCategories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{isAr ? "فئة الخدمة" : "Service Category"}</label>
              <select value={serviceCategoryId} onChange={(e) => setServiceCategoryId(e.target.value)} className={selectClass}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(serviceCategories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr || c.nameEn : c.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => searchMutation.mutate()} disabled={!canSearch || searchMutation.isPending} fullWidth>
                {searchMutation.isPending ? "…" : isAr ? "بحث" : "Search"}
              </Button>
            </div>
          </div>

          {searched && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <THead>
                  <tr>
                    <Th>{isAr ? "رقم الفاتورة" : "Invoice No"}</Th>
                    <Th>{isAr ? "التاريخ" : "Date"}</Th>
                    <Th>{isAr ? "العميل" : "Customer"}</Th>
                    <Th>{isAr ? "الإجمالي" : "Total"}</Th>
                    <Th>{isAr ? "الأصناف" : "Items"}</Th>
                    <Th>{isAr ? "تصنيف" : "Classify"}</Th>
                  </tr>
                </THead>
                <tbody>
                  {searchResults.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2"><span className="ltr-nums">{s.invoiceNumber}</span></td>
                      <td className="px-3 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(s.saleDate).toLocaleDateString(locale)}</span></td>
                      <td className="px-3 py-2">{isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn}</td>
                      <td className="px-3 py-2"><span className="ltr-nums">{formatMoney(s.totalAmount, currency, locale)}</span></td>
                      <td className="px-3 py-2"><span className="ltr-nums">{s.itemCount}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {BUCKET_KEYS.map((k) => (
                            <button
                              key={k}
                              onClick={() => classify(s, k)}
                              className={cn("rounded border px-2 py-0.5 text-xs font-medium", BUCKET_LABEL[k].cls)}
                            >
                              {isAr ? BUCKET_LABEL[k].ar : BUCKET_LABEL[k].en}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {searchResults.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                        {isAr ? "لا توجد مبيعات جاهزة" : "No ready sales found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {BUCKET_KEYS.map((k) => {
          const rows = buckets[k];
          const total = rows.reduce((sum, s) => sum + Number(s.totalAmount), 0);
          return (
            <Card key={k} className="p-4">
              <div className={cn("mb-2 rounded-lg border px-3 py-1.5 text-sm font-semibold", BUCKET_LABEL[k].cls)}>
                {isAr ? BUCKET_LABEL[k].ar : BUCKET_LABEL[k].en} <span className="ltr-nums">({rows.length})</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {rows.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1.5 text-xs">
                    <div>
                      <div className="ltr-nums font-medium text-slate-700">{s.invoiceNumber}</div>
                      <div className="text-slate-400">{isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="ltr-nums text-slate-600">{formatMoney(s.totalAmount, currency, locale)}</span>
                      {!isReadOnly && (
                        <button onClick={() => unclassify(k, s.id)} className="text-slate-300 hover:text-red-500" aria-label="remove">
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {rows.length === 0 && <p className="py-3 text-center text-xs text-slate-400">{isAr ? "لا توجد عناصر" : "No items"}</p>}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-slate-600">
                <span>{isAr ? "الإجمالي" : "Total"}</span>
                <span className="ltr-nums">{formatMoney(total, currency, locale)}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-2">
        {!isReadOnly && (
          <Button
            onClick={() => {
              setError(null);
              saveMutation.mutate();
            }}
            disabled={!canSubmit || saveMutation.isPending}
          >
            {saveMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate("/inventory-postings")}>
          {isReadOnly ? (isAr ? "رجوع" : "Back") : isAr ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
