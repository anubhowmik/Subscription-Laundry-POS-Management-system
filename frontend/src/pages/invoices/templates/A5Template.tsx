import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceTemplateProps } from "../invoiceTypes";

export function A5Template(props: InvoiceTemplateProps) {
  return (
    <InvoiceDocument
      {...props}
      size={{
        containerClass: "mx-auto min-h-screen max-w-md bg-white p-4 text-slate-800 print:p-0",
        bodyClass: "border border-slate-300 p-4 text-xs",
        qrSizeClass: "h-20 w-20",
      }}
    />
  );
}
