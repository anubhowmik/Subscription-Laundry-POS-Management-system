import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceTemplateProps } from "../invoiceTypes";

// 58mm thermal roll paper - narrow, tight spacing, no side margins to waste.
export function Thermal58Template(props: InvoiceTemplateProps) {
  return (
    <InvoiceDocument
      {...props}
      size={{
        containerClass: "mx-auto min-h-screen w-[220px] bg-white p-2 text-slate-800 print:p-0",
        bodyClass: "p-1 text-[10px] leading-tight",
        qrSizeClass: "h-16 w-16",
      }}
    />
  );
}
