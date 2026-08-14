import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceTemplateProps } from "../invoiceTypes";

export function StandardTemplate(props: InvoiceTemplateProps) {
  return (
    <InvoiceDocument
      {...props}
      size={{
        containerClass: "mx-auto min-h-screen max-w-2xl bg-white p-6 text-slate-800 print:p-0",
        bodyClass: "border border-slate-300 p-6 text-sm",
        qrSizeClass: "h-28 w-28",
      }}
    />
  );
}
