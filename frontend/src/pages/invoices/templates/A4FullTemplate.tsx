import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceTemplateProps } from "../invoiceTypes";

export function A4FullTemplate(props: InvoiceTemplateProps) {
  return (
    <InvoiceDocument
      {...props}
      size={{
        containerClass: "mx-auto min-h-screen max-w-3xl bg-white p-10 text-slate-800 print:p-0",
        bodyClass: "border border-slate-300 p-8 text-sm",
        qrSizeClass: "h-32 w-32",
      }}
    />
  );
}
