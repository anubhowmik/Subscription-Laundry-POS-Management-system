import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { Download, Upload, FileSpreadsheet, Undo2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { confirmAction } from "../../stores/confirmStore";
import { formatDate } from "../../lib/format";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Card, CardBody } from "../../components/ui/Card";
import { Table, THead, Th, Td } from "../../components/ui/Table";
import { LoadingState } from "../../components/ui/Spinner";

interface ImportResult {
  imported: number;
  errors: string[];
}

interface ImportBatch {
  importBatch: number;
  importedAt: string | null;
  createdBy: string;
  invoiceNumbers: string[];
}

type Requiredness = "always" | "optional";

interface ColumnSpec {
  header: string;
  requiredness: Requiredness;
  hint: string;
  example: string;
}

// Mirrors backend/src/utils/saleImport.ts's SALE_IMPORT_HEADER_MAP exactly - see that file's
// module comment for why this is scoped to FINAL sales only and skips the ZATCA icv/hash chain,
// unlike the reference's own (partly dead-code) ImportSalesController.
const COLUMNS: ColumnSpec[] = [
  { header: "Business Location", requiredness: "always", hint: "Must match an existing branch name exactly.", example: "Main Branch" },
  { header: "Invoice No", requiredness: "always", hint: "Rows sharing the same Invoice No become one multi-item sale.", example: "OLD-INV-1001" },
  { header: "Date", requiredness: "optional", hint: "Defaults to today if blank.", example: "2025-01-15" },
  { header: "Customer Phone", requiredness: "always", hint: "Must match an existing customer's phone number.", example: "0512345678" },
  { header: "Item Code", requiredness: "always", hint: "A product SKU or a service code.", example: "WASH-001" },
  { header: "Quantity", requiredness: "always", hint: "", example: "2" },
  { header: "Unit Price", requiredness: "always", hint: "Excluding tax.", example: "40.00" },
  { header: "Discount %", requiredness: "optional", hint: "Defaults to 0 if blank.", example: "0" },
  { header: "Tax %", requiredness: "optional", hint: "Defaults to the item's own catalog tax rate if blank.", example: "" },
  { header: "Note", requiredness: "optional", hint: "", example: "" },
  { header: "Created By", requiredness: "optional", hint: "A username - defaults to the person running the import.", example: "" },
];

function downloadTemplate() {
  const headers = COLUMNS.map((c) => c.header);
  const row = COLUMNS.map((c) => c.example);
  const escapeCell = (cell: string) => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell);
  const csv = [headers, row].map((r) => r.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sales-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function RequirednessBadge({ requiredness, isAr }: { requiredness: Requiredness; isAr: boolean }) {
  if (requiredness === "always") return <Badge variant="danger">{isAr ? "مطلوب" : "Required"}</Badge>;
  return <Badge variant="neutral">{isAr ? "اختياري" : "Optional"}</Badge>;
}

/**
 * Reference's own "Import Sales" (ImportSalesController + import_sales/index.blade.php) - upload
 * a spreadsheet of historical invoices, plus a history of past import runs with a "Revert Import"
 * action per batch, matching the reference's own two-tab (Instructions/Imports) layout collapsed
 * into stacked cards.
 */
export default function ImportSalesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["import-sales-batches"],
    queryFn: async () => (await api.get<ApiSuccess<ImportBatch[]>>("/import-sales")).data.data,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<ApiSuccess<ImportResult>>("/import-sales", formData);
      return res.data.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setServerError(null);
      if (data.errors.length === 0) {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        qc.invalidateQueries({ queryKey: ["import-sales-batches"] });
      }
    },
    onError: (err) => {
      setResult(null);
      setServerError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong"));
    },
  });

  const [revertError, setRevertError] = useState<string | null>(null);
  const revertMutation = useMutation({
    mutationFn: async (batch: number) => api.delete(`/import-sales/${batch}`),
    onSuccess: () => {
      setRevertError(null);
      qc.invalidateQueries({ queryKey: ["import-sales-batches"] });
    },
    // Without this the safety block in importSales.service.ts's revertBatch() (refusing to
    // revert a batch once a real payment/return has been recorded against one of its invoices)
    // would fail completely silently - no global toast exists for a generic 4xx (see
    // api/client.ts's interceptor, which only special-cases 401/402).
    onError: (err) => setRevertError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong")),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "استيراد المبيعات" : "Import Sales"} subtitle={isAr ? "استيراد فواتير سابقة من ملف جدول بيانات" : "Bulk-load historical invoices from a spreadsheet"} />

      <Card>
        <CardBody className="space-y-4">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700">
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
            {isAr ? "تنزيل نموذج الملف" : "Download Template"}
          </button>
          <p className="text-sm text-slate-500">
            {isAr
              ? "كل صف هو صنف واحد؛ الصفوف التي تشترك في نفس رقم الفاتورة تُجمع في عملية بيع واحدة."
              : "Each row is one line item; rows sharing the same Invoice No are grouped into one sale."}
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-sky-400 hover:bg-sky-50/40">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setServerError(null);
              }}
            />
            {file ? (
              <>
                <FileSpreadsheet className="h-8 w-8 text-sky-600" strokeWidth={1.5} aria-hidden />
                <span className="text-sm font-medium text-slate-700">{file.name}</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-400" strokeWidth={1.5} aria-hidden />
                <span className="text-sm text-slate-500">{isAr ? "اختر ملفًا" : "Choose a file"}</span>
              </>
            )}
          </label>

          {serverError && <Alert variant="danger">{serverError}</Alert>}

          {result && result.errors.length === 0 && (
            <Alert variant="success">{isAr ? `تم استيراد ${result.imported} فاتورة بنجاح` : `${result.imported} invoice(s) imported successfully`}</Alert>
          )}

          {result && result.errors.length > 0 && (
            <Alert variant="danger" className="space-y-2">
              <p className="font-medium">{isAr ? `تم العثور على ${result.errors.length} خطأ` : `${result.errors.length} error(s) found`}</p>
              <ul className="max-h-64 list-disc space-y-1 overflow-y-auto ps-5">
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Button onClick={() => importMutation.mutate()} disabled={!file || importMutation.isPending}>
            {importMutation.isPending ? t("common.loading") : isAr ? "استيراد" : "Import"}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">{isAr ? "تعليمات الأعمدة" : "Column Instructions"}</h3>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200">
            <Table>
              <THead className="sticky top-0">
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>{isAr ? "اسم العمود" : "Column Name"}</Th>
                  <Th>{isAr ? "الحالة" : "Status"}</Th>
                  <Th>{isAr ? "ملاحظة" : "Instruction"}</Th>
                </tr>
              </THead>
              <tbody>
                {COLUMNS.map((c, i) => (
                  <tr key={c.header} className="border-b border-slate-100 last:border-0">
                    <Td className="ltr-nums text-slate-400">{i + 1}</Td>
                    <Td className="font-medium text-slate-700">{c.header}</Td>
                    <Td>
                      <RequirednessBadge requiredness={c.requiredness} isAr={isAr} />
                    </Td>
                    <Td className="text-slate-500">{c.hint || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">{isAr ? "سجل الاستيراد" : "Import History"}</h3>
          {revertError && <Alert variant="danger">{revertError}</Alert>}
          {batchesLoading && <LoadingState label={t("common.loading")} />}
          {!batchesLoading && (batches?.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-slate-400">{t("common.noResults")}</p>}
          {!batchesLoading && (batches?.length ?? 0) > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <THead>
                  <tr>
                    <Th className="whitespace-nowrap">{isAr ? "الدفعة" : "Batch"}</Th>
                    <Th className="whitespace-nowrap">{isAr ? "وقت الاستيراد" : "Import Time"}</Th>
                    <Th className="whitespace-nowrap">{isAr ? "بواسطة" : "Created By"}</Th>
                    <Th>{isAr ? "الفواتير" : "Invoices"}</Th>
                    <Th className="whitespace-nowrap">{t("common.actions")}</Th>
                  </tr>
                </THead>
                <tbody>
                  {batches!.map((b) => (
                    <tr key={b.importBatch} className="border-b border-slate-100 last:border-0">
                      <Td className="ltr-nums whitespace-nowrap">{b.importBatch}</Td>
                      <Td className="ltr-nums whitespace-nowrap">{b.importedAt ? formatDate(b.importedAt, isAr ? "ar-SA" : "en-US") : "-"}</Td>
                      <Td className="whitespace-nowrap">{b.createdBy}</Td>
                      <Td>
                        <span className="text-slate-600">{b.invoiceNumbers.join(", ")}</span>
                        <span className="ms-1 text-xs text-slate-400 ltr-nums">({b.invoiceNumbers.length})</span>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!text-red-500 hover:!bg-red-50"
                          disabled={revertMutation.isPending}
                          onClick={async () => {
                            if (
                              await confirmAction({
                                message: isAr
                                  ? "هل تريد التراجع عن هذه الدفعة؟ سيتم حذف جميع فواتيرها بشكل نهائي."
                                  : "Revert this import batch? All its invoices will be permanently deleted.",
                                danger: true,
                              })
                            ) {
                              revertMutation.mutate(b.importBatch);
                            }
                          }}
                        >
                          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          {isAr ? "التراجع عن الاستيراد" : "Revert Import"}
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
