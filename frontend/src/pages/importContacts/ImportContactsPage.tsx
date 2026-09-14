import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Card, CardBody } from "../../components/ui/Card";
import { Table, THead, Th, Td } from "../../components/ui/Table";
import { cn } from "../../lib/cn";

type ContactType = "customers" | "suppliers";

interface ImportResult {
  imported: number;
  errors: string[];
}

interface ContactCustomFieldLabels {
  contactCustomField1Label: string | null;
  contactCustomField2Label: string | null;
  contactCustomField3Label: string | null;
  contactCustomField4Label: string | null;
  contactCustomField5Label: string | null;
  contactCustomField6Label: string | null;
  contactCustomField7Label: string | null;
  contactCustomField8Label: string | null;
  contactCustomField9Label: string | null;
  contactCustomField10Label: string | null;
}

function useCustomFieldLabels(isAr: boolean) {
  const { data } = useQuery({
    queryKey: ["contact-custom-field-labels"],
    queryFn: async () => (await api.get<ApiSuccess<ContactCustomFieldLabels>>("/organizations/custom-field-labels")).data.data,
  });
  return Array.from({ length: 10 }, (_, i) => {
    const key = `contactCustomField${i + 1}Label` as keyof ContactCustomFieldLabels;
    return data?.[key] || (isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`);
  });
}

// Required-ness per the reference's `contact/import.blade.php` instructions table, converted onto
// this app's own contactType-driven name computation (see backend's contactImport.ts) rather than
// the reference's own literal "First Name always required" rule - see that file's comment for why.
type Requiredness = "always" | "individual" | "business" | "optional";

interface ColumnSpec {
  header: string;
  requiredness: Requiredness;
  hint: string;
  example: string;
  customerOnly?: boolean;
}

// Mirrors backend/src/utils/contactImport.ts's CONTACT_HEADER_MAP (+ the customer-only
// CUSTOMER_GROUP_HEADER/PRICE_LIST_HEADER/INVOICE_LAYOUT_HEADER) exactly - same header labels, same
// set of columns - keep the two in sync if either changes. Field-by-field converted from the
// reference's own 35-column import spec, adapted to this app's schema (see contactImport.ts's
// module comment for the departures: structured name matches this app's real Individual/Business
// toggle rather than the reference's own always-required First Name; Custom Field extends to 10,
// matching this app's own richer custom-field feature instead of the reference's 4).
function buildColumns(customFieldLabels: string[]): ColumnSpec[] {
  return [
    { header: "Code", requiredness: "optional", hint: "Leave blank to auto-generate. If it matches an existing contact's Code, that contact is UPDATED instead of creating a new one.", example: "" },
    { header: "Individual/Business", requiredness: "optional", hint: '"Individual" or "Business" - defaults to Individual if blank.', example: "Individual" },
    { header: "Prefix", requiredness: "optional", hint: "e.g. Mr / Mrs / Miss", example: "Mr" },
    { header: "First Name", requiredness: "individual", hint: "Required when Individual/Business is Individual.", example: "Ahmed" },
    { header: "Middle Name", requiredness: "optional", hint: "", example: "" },
    { header: "Last Name", requiredness: "optional", hint: "", example: "Al-Otaibi" },
    { header: "Business Name", requiredness: "business", hint: "Required when Individual/Business is Business.", example: "" },
    { header: "Name (Arabic)", requiredness: "optional", hint: "", example: "أحمد العتيبي" },
    { header: "Phone", requiredness: "always", hint: "Saudi format, e.g. 05XXXXXXXX", example: "0512345678" },
    { header: "Alt Phone", requiredness: "optional", hint: "", example: "" },
    { header: "Landline", requiredness: "optional", hint: "", example: "" },
    { header: "Email", requiredness: "optional", hint: "", example: "ahmed@example.com" },
    { header: "Address", requiredness: "optional", hint: "", example: "123 King Fahd Rd" },
    { header: "Address Line 2", requiredness: "optional", hint: "", example: "" },
    { header: "City", requiredness: "optional", hint: "", example: "Riyadh" },
    { header: "District", requiredness: "optional", hint: "", example: "Olaya" },
    { header: "State", requiredness: "optional", hint: "", example: "" },
    { header: "Country", requiredness: "optional", hint: "", example: "" },
    { header: "Postal Code", requiredness: "optional", hint: "", example: "12345" },
    { header: "Building No", requiredness: "optional", hint: "", example: "" },
    { header: "Additional No", requiredness: "optional", hint: "", example: "" },
    {
      header: "ID Type",
      requiredness: "optional",
      hint: "TIN, CRN, MOM, MLS, 700, SAG, NAT, IQA, PAS or OTH - defaults to TIN if blank.",
      example: "",
    },
    { header: "VAT Number", requiredness: "optional", hint: "", example: "300000000000003" },
    { header: "CR Number", requiredness: "optional", hint: "", example: "1010101010" },
    { header: "National Address", requiredness: "optional", hint: "", example: "" },
    { header: "Date of Birth", requiredness: "optional", hint: "YYYY-MM-DD, e.g. " + new Date().toISOString().slice(0, 10), example: "" },
    { header: "Credit Limit", requiredness: "optional", hint: "Defaults to 0 if blank.", example: "0" },
    { header: "Payment Terms (Days)", requiredness: "optional", hint: "Defaults to 0 if blank.", example: "0" },
    { header: "Opening Balance", requiredness: "optional", hint: "Defaults to 0 if blank.", example: "0" },
    { header: "Notes", requiredness: "optional", hint: "", example: "" },
    { header: "Business Location", requiredness: "optional", hint: "Must match an existing branch name exactly.", example: "" },
    { header: "Customer Group", requiredness: "optional", hint: "Must match an existing customer group name exactly.", example: "", customerOnly: true },
    { header: "Selling Price Group", requiredness: "optional", hint: "Must match an existing price list name exactly.", example: "", customerOnly: true },
    { header: "Invoice Layout", requiredness: "optional", hint: "Must match an existing invoice layout name exactly.", example: "", customerOnly: true },
    ...customFieldLabels.map((label): ColumnSpec => ({ header: label, requiredness: "optional", hint: "", example: "" })),
  ];
}

function downloadTemplate(type: ContactType, columns: ColumnSpec[]) {
  const relevant = columns.filter((c) => type === "customers" || !c.customerOnly);
  const headers = relevant.map((c) => c.header);
  const row = relevant.map((c) => c.example);
  const escapeCell = (cell: string) => (cell.includes(",") || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell);
  const csv = [headers, row].map((r) => r.map(escapeCell).join(",")).join("\r\n");
  // UTF-8 BOM so Excel opens the Arabic name column correctly instead of mangling it.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}-import-template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RequirednessBadge({ requiredness, isAr }: { requiredness: Requiredness; isAr: boolean }) {
  if (requiredness === "always") return <Badge variant="danger">{isAr ? "مطلوب" : "Required"}</Badge>;
  if (requiredness === "individual") return <Badge variant="warning">{isAr ? "مطلوب - فردي" : "Required if Individual"}</Badge>;
  if (requiredness === "business") return <Badge variant="warning">{isAr ? "مطلوب - شركة" : "Required if Business"}</Badge>;
  return <Badge variant="neutral">{isAr ? "اختياري" : "Optional"}</Badge>;
}

export default function ImportContactsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const canImportCustomers = can("customers.create");
  const canImportSuppliers = can("suppliers.manage");

  const [type, setType] = useState<ContactType>(canImportCustomers ? "customers" : "suppliers");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customFieldLabels = useCustomFieldLabels(isAr);
  const columns = buildColumns(customFieldLabels);
  const visibleColumns = columns.filter((c) => type === "customers" || !c.customerOnly);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<ApiSuccess<ImportResult>>(`/${type}/import`, formData);
      return res.data.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setServerError(null);
      if (data.errors.length === 0) {
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    onError: (err) => {
      setResult(null);
      setServerError(isAxiosError(err) ? (err.response?.data?.message ?? t("common.somethingWentWrong")) : t("common.somethingWentWrong"));
    },
  });

  function switchType(next: ContactType) {
    setType(next);
    setFile(null);
    setResult(null);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("importContacts.title")} subtitle={t("importContacts.subtitle")} />

      <div className="flex gap-2">
        {canImportCustomers && (
          <button
            type="button"
            onClick={() => switchType("customers")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              type === "customers" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {t("nav.customers")}
          </button>
        )}
        {canImportSuppliers && (
          <button
            type="button"
            onClick={() => switchType("suppliers")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              type === "suppliers" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {t("nav.suppliers")}
          </button>
        )}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <button
            type="button"
            onClick={() => downloadTemplate(type, columns)}
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700"
          >
            <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("importContacts.downloadTemplate")}
          </button>
          <p className="text-sm text-slate-500">{t("importContacts.instructions")}</p>

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
                <span className="text-sm text-slate-500">{t("importContacts.chooseFile")}</span>
              </>
            )}
          </label>

          {serverError && <Alert variant="danger">{serverError}</Alert>}

          {result && result.errors.length === 0 && (
            <Alert variant="success">{t("importContacts.successMessage", { count: result.imported })}</Alert>
          )}

          {result && result.errors.length > 0 && (
            <Alert variant="danger" className="space-y-2">
              <p className="font-medium">{t("importContacts.errorsFound", { count: result.errors.length })}</p>
              <ul className="max-h-64 list-disc space-y-1 overflow-y-auto ps-5">
                {result.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Button onClick={() => importMutation.mutate()} disabled={!file || importMutation.isPending}>
            {importMutation.isPending ? t("common.loading") : t("importContacts.import")}
          </Button>
        </CardBody>
      </Card>

      {/* Column-by-column spec table - converted from the reference's own `contact/import.blade.php`
          instructions table (column #, name, required/optional, hint), extended with this app's
          own richer field set (structured name, 10 custom fields, Selling Price Group/Invoice
          Layout for customers). */}
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
                {visibleColumns.map((c, i) => (
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
    </div>
  );
}
