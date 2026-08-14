import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceTemplateProps } from "../invoiceTypes";

// 80mm thermal roll paper - a bit more breathing room than 58mm, still no side margins.
export function Thermal80Template(props: InvoiceTemplateProps) {
  return (
    <InvoiceDocument
      {...props}
      size={{
        containerClass: "mx-auto min-h-screen w-[300px] bg-white p-2 text-slate-800 print:p-0",
        bodyClass: "p-2 text-xs leading-snug",
        qrSizeClass: "h-20 w-20",
      }}
    />
  );
}
