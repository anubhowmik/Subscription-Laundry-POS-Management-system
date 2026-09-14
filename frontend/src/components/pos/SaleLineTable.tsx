import { forwardRef, useState } from "react";
import { X, Search, Plus } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { useProducts, useServices, type PosProduct, type PosService } from "../../api/posApi";
import { usePosStore, type PosLine } from "../../stores/posStore";
import { calcLine } from "../../lib/posCalc";
import { formatMoney } from "../../lib/format";
import { inputSmClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { QuickAddProductModal } from "./QuickAddProductModal";
import { QuickAddServiceModal } from "./QuickAddServiceModal";
import { LineEditModal } from "./LineEditModal";

interface Props {
  businessLocationId: string;
  currency: string;
  locale: string;
  isAr: boolean;
  onOutOfStock: (name: string) => void;
  /** Mirrors ProductGrid.tsx's `fixedMode` - restricts search/quick-add to just this catalog when
   * Add Sale is opened from inside Service POS or Product POS (undefined on POS Laundry/legacy,
   * unchanged mixed behavior). Without this, a Service-POS-only role searching here fired an
   * unconditional `GET /products` that 403s (that route requires app.pos_laundry/app.pos_product),
   * the same class of bug as ProductGrid's own fixedMode - just missed for this table variant. */
  fixedMode?: "SERVICE" | "PRODUCT";
}

/**
 * The reference's "Add Sale" line-items table (`sell/create.blade.php`'s `#pos_table`), converted
 * column-for-column: Product / Qty / Unit Price / Discount / Tax / Price inc. Tax / Subtotal /
 * remove. This is a DIFFERENT presentation of the exact same cart (posStore) the touch-optimized
 * POS grid (ProductGrid.tsx) uses - "Add Sale" and "POS Sale" both post to the same checkout
 * endpoint in the reference itself (`sell/create.blade.php`'s form posts to
 * `SellPosController@store`, identical to `sale_pos/create.blade.php`), so this table is a second
 * FRONTEND workflow onto the same backend, not a separate feature - a back-office-style row-entry
 * screen for staff who'd rather search-and-type than click a product grid.
 *
 * Unit Price/Tax are only actually editable via the row's edit popup (LineEditModal, matching the
 * reference's own `edit_product_price_from_sale_screen`-gated `row_edit_product_price_modal`) for
 * a caller holding pos.editLinePrice - everyone else opens the same popup read-only for that pair
 * but can still set a note or laundry dimension pricing there, which carry no such gate.
 */
export const SaleLineTable = forwardRef<HTMLInputElement, Props>(function SaleLineTable(
  { businessLocationId, currency, locale, isAr, onOutOfStock, fixedMode },
  searchRef,
) {
  const [search, setSearch] = useState("");
  // Reference's own "+" (`fa-plus-circle`) next to the search box, opening `ProductController@
  // quickAdd` - a full create form in a modal rather than leaving the sale screen. This app
  // already has a genuinely simplified Product/Service create form (built for this laundry's own
  // needs, not a scaled-down duplicate invented here) - reused as-is rather than building a third,
  // narrower quick-add form. Mixes products AND services (the reference's own quick-add is
  // product-only, since this laundry-specific service concept doesn't exist there).
  const [quickAddKind, setQuickAddKind] = useState<"PRODUCT" | "SERVICE" | null>(null);
  const lines = usePosStore((s) => s.lines);
  const addItem = usePosStore((s) => s.addItem);
  const customerId = usePosStore((s) => s.customer?.id);

  const { data: products } = useProducts({ businessLocationId, search, customerId, enabled: search.length > 0 && fixedMode !== "SERVICE" });
  const { data: services } = useServices({ businessLocationId, search, customerId, enabled: search.length > 0 && fixedMode !== "PRODUCT" });
  const results = [
    ...(services ?? []).map((s) => ({ kind: "SERVICE" as const, item: s })),
    ...(products ?? []).map((p) => ({ kind: "PRODUCT" as const, item: p })),
  ];

  function addProduct(p: PosProduct) {
    const stock = p.stocks?.find((x) => x.businessLocationId === businessLocationId);
    const stockQty = stock ? Number(stock.quantity) : 0;
    if (p.manageStock && stockQty <= 0) return onOutOfStock(isAr ? p.nameAr || p.nameEn : p.nameEn);
    addItem({
      type: "PRODUCT",
      id: p.id,
      nameEn: p.nameEn,
      nameAr: p.nameAr,
      sku: p.sku,
      barcode: p.barcode,
      unitPrice: Number(p.sellingPrice),
      taxPercent: Number(p.tax?.percentage ?? 0),
      taxType: p.sellingPriceTaxType,
      stockOnHand: p.manageStock ? stockQty : undefined,
      manageStock: p.manageStock,
      unit: p.unit?.shortName ?? "",
    });
    setSearch("");
  }

  function addService(s: PosService) {
    addItem({
      type: "SERVICE",
      id: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      sku: s.code,
      barcode: null,
      unitPrice: Number(s.price),
      taxPercent: Number(s.tax?.percentage ?? 0),
      taxType: "EXCLUSIVE",
      manageStock: false,
      unit: s.unit?.shortName ?? "",
    });
    setSearch("");
  }

  async function onProductQuickAdded(createdId?: string) {
    setQuickAddKind(null);
    if (!createdId) return;
    const res = await api.get<ApiSuccess<PosProduct>>(`/products/${createdId}`);
    addProduct(res.data.data);
  }

  async function onServiceQuickAdded(createdId?: string) {
    setQuickAddKind(null);
    if (!createdId) return;
    const res = await api.get<ApiSuccess<PosService>>(`/services/${createdId}`);
    addService(res.data.data);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              fixedMode === "SERVICE"
                ? isAr
                  ? "ابحث عن خدمة بالاسم أو الرمز"
                  : "Search a service by name or SKU"
                : fixedMode === "PRODUCT"
                  ? isAr
                    ? "ابحث عن منتج بالاسم أو الرمز"
                    : "Search a product by name or SKU"
                  : isAr
                    ? "ابحث عن منتج أو خدمة بالاسم أو الرمز"
                    : "Search a product or service by name or SKU"
            }
            className={cn(inputSmClass, "w-full ps-9")}
          />
          {search && results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <button
                  key={`${r.kind}:${r.item.id}`}
                  type="button"
                  onClick={() => (r.kind === "PRODUCT" ? addProduct(r.item) : addService(r.item))}
                  className="flex w-full items-center justify-between px-3 py-2 text-start text-sm transition-colors hover:bg-slate-100"
                >
                  <span>{isAr ? r.item.nameAr || r.item.nameEn : r.item.nameEn}</span>
                  <span className="ltr-nums text-xs text-slate-400">{formatMoney(r.kind === "PRODUCT" ? r.item.sellingPrice : r.item.price, currency, locale)}</span>
                </button>
              ))}
            </div>
          )}
          {search && results.length === 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-slate-200 bg-white p-3 text-center text-xs text-slate-400 shadow-lg">
              {isAr ? "لا نتائج" : "No results"}
            </div>
          )}
        </div>
        <QuickAddButton isAr={isAr} fixedMode={fixedMode} onPick={setQuickAddKind} />
      </div>

      {quickAddKind === "PRODUCT" && (
        <QuickAddProductModal isAr={isAr} businessLocationId={businessLocationId} onClose={() => setQuickAddKind(null)} onCreated={onProductQuickAdded} />
      )}
      {quickAddKind === "SERVICE" && (
        <QuickAddServiceModal isAr={isAr} businessLocationId={businessLocationId} onClose={() => setQuickAddKind(null)} onCreated={onServiceQuickAdded} />
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">{isAr ? "المنتج" : "Product"}</th>
              <th className="px-3 py-2 text-center">{isAr ? "الكمية" : "Qty"}</th>
              <th className="px-3 py-2 text-end">{isAr ? "سعر الوحدة" : "Unit Price"}</th>
              <th className="px-3 py-2 text-end">{isAr ? "الخصم" : "Discount"}</th>
              <th className="px-3 py-2 text-end">{isAr ? "الضريبة" : "Tax"}</th>
              <th className="px-3 py-2 text-end">{isAr ? "السعر شامل الضريبة" : "Price inc. Tax"}</th>
              <th className="px-3 py-2 text-end">{isAr ? "الإجمالي الفرعي" : "Subtotal"}</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-400">
                  {fixedMode === "SERVICE"
                    ? isAr
                      ? "ابحث عن خدمة أعلاه لإضافتها"
                      : "Search a service above to add it"
                    : fixedMode === "PRODUCT"
                      ? isAr
                        ? "ابحث عن منتج أعلاه لإضافته"
                        : "Search a product above to add it"
                      : isAr
                        ? "ابحث عن منتج أو خدمة أعلاه لإضافتها"
                        : "Search a product or service above to add it"}
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <SaleLineRow key={line.key} line={line} currency={currency} locale={locale} isAr={isAr} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function SaleLineRow({ line, currency, locale, isAr }: { line: PosLine; currency: string; locale: string; isAr: boolean }) {
  const store = usePosStore();
  const [editOpen, setEditOpen] = useState(false);
  const overStock = line.manageStock && line.stockOnHand !== undefined && line.quantity > line.stockOnHand;
  const t = calcLine(line);
  const effectivePrice = line.unitPriceOverride ?? line.unitPrice;
  const effectiveTaxPercent = line.taxOverridePercent ?? line.taxPercent;
  const unitPriceIncTax = line.taxType === "INCLUSIVE" ? effectivePrice : effectivePrice * (1 + effectiveTaxPercent / 100);
  const hasOverrides = line.unitPriceOverride != null || line.taxOverrideId != null || line.note || (line.widthM && line.heightM);

  return (
    <tr className={cn("border-b border-slate-100 last:border-0", overStock ? "bg-red-50" : "hover:bg-slate-50/60")}>
      <td className="px-3 py-2">
        <button type="button" onClick={() => setEditOpen(true)} className="text-start" title={isAr ? "تعديل السطر" : "Edit line"}>
          <p className="font-medium text-slate-800 hover:underline">
            {isAr ? line.nameAr || line.nameEn : line.nameEn}
            {hasOverrides && <span className="ms-1 text-sky-500">●</span>}
          </p>
          {line.sku && <p className="ltr-nums text-xs text-slate-400">{line.sku}</p>}
          {overStock && <p className="text-[11px] font-medium text-red-600">{isAr ? `المتوفر: ${line.stockOnHand}` : `Only ${line.stockOnHand} in stock`}</p>}
        </button>
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="number"
          min={1}
          value={line.quantity}
          onChange={(e) => store.setQty(line.key, Number(e.target.value))}
          className="ltr-nums w-16 rounded border border-slate-200 px-1.5 py-1 text-center text-sm"
        />
      </td>
      <td className="ltr-nums px-3 py-2 text-end text-slate-600">
        <button type="button" onClick={() => setEditOpen(true)} className="hover:underline">
          {formatMoney(effectivePrice, currency, locale)}
        </button>
      </td>
      <td className="px-3 py-2 text-end">
        <input
          type="number"
          min={0}
          step="0.01"
          value={line.discountAmount}
          onChange={(e) => store.setLineDiscount(line.key, Number(e.target.value))}
          className="ltr-nums w-20 rounded border border-slate-200 px-1.5 py-1 text-end text-sm"
        />
      </td>
      <td className="ltr-nums px-3 py-2 text-end text-slate-600">{formatMoney(t.taxAmount, currency, locale)}</td>
      <td className="ltr-nums px-3 py-2 text-end text-slate-600">{formatMoney(unitPriceIncTax, currency, locale)}</td>
      <td className="ltr-nums px-3 py-2 text-end font-semibold text-slate-800">{formatMoney(t.total, currency, locale)}</td>
      <td className="px-3 py-2 text-center">
        <button type="button" onClick={() => store.removeLine(line.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </td>
      {editOpen && <LineEditModal line={line} currency={currency} locale={locale} isAr={isAr} onClose={() => setEditOpen(false)} />}
    </tr>
  );
}

/** Reference's own "+" (`fa-plus-circle`) next to the search box - a single popover choice here
 * since this app has two separate catalogs (Products/Services) where the reference has only one. */
function QuickAddButton({
  isAr,
  fixedMode,
  onPick,
}: {
  isAr: boolean;
  fixedMode?: "SERVICE" | "PRODUCT";
  onPick: (kind: "PRODUCT" | "SERVICE") => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isAr ? "إضافة سريعة" : "Quick Add"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sky-600 shadow-sm transition-colors hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
      >
        <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {fixedMode !== "SERVICE" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPick("PRODUCT");
              }}
              className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-100"
            >
              {isAr ? "منتج جديد" : "New Product"}
            </button>
          )}
          {fixedMode !== "PRODUCT" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPick("SERVICE");
              }}
              className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-100"
            >
              {isAr ? "خدمة جديدة" : "New Service"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
