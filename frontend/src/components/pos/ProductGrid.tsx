import { forwardRef, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useBrands,
  useCategories,
  useProducts,
  useServices,
  useServiceCategories,
  type PosProduct,
  type PosService,
} from "../../api/posApi";
import { usePosStore } from "../../stores/posStore";
import { formatMoney } from "../../lib/format";

interface Props {
  businessLocationId: string;
  currency: string;
  locale: string;
  isAr: boolean;
  onOutOfStock: (name: string) => void;
}

type Mode = "SERVICES" | "PRODUCTS";

const SERVICE_ICONS: Record<string, string> = {
  "wash & iron": "👕",
  "iron only": "🧺",
  "dry clean": "🧥",
  special: "✨",
};

function iconFor(categoryName: string | undefined | null): string {
  if (!categoryName) return "🧺";
  return SERVICE_ICONS[categoryName.trim().toLowerCase()] ?? "🧺";
}

/**
 * Right panel of the POS. A laundry sells SERVICES (wash, iron, dry-clean per garment), so the
 * grid opens on Services with a Products tab for shops that also sell retail goods. Item tiles
 * carry a quantity badge once they're in the cart, matching the reference design's icon-grid
 * ordering screen.
 */
export const ProductGrid = forwardRef<HTMLInputElement, Props>(function ProductGrid(
  { businessLocationId, currency, locale, isAr, onOutOfStock },
  searchRef,
) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("SERVICES");
  const [search, setSearch] = useState("");
  const [prodCategoryId, setProdCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [svcCategoryId, setSvcCategoryId] = useState("");

  const lines = usePosStore((s) => s.lines);
  const addItem = usePosStore((s) => s.addItem);
  const incQty = usePosStore((s) => s.incQty);
  const decQty = usePosStore((s) => s.decQty);
  const customerId = usePosStore((s) => s.customer?.id);

  const { data: categories } = useCategories();
  const { data: brands } = useBrands();
  const { data: products, isLoading: prodLoading } = useProducts({ businessLocationId, categoryId: prodCategoryId, brandId, search, customerId });
  const { data: svcCategories } = useServiceCategories();
  const { data: services, isLoading: svcLoading } = useServices({ businessLocationId, categoryId: svcCategoryId, search, customerId });

  function locationStock(p: PosProduct): number {
    if (!p.manageStock) return Infinity;
    const s = p.stocks?.find((x) => x.businessLocationId === businessLocationId);
    return s ? Number(s.quantity) : p.totalStock ?? 0;
  }

  function addProduct(p: PosProduct) {
    const stock = locationStock(p);
    if (p.manageStock && stock <= 0) return onOutOfStock(isAr ? p.nameAr || p.nameEn : p.nameEn);
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
      stockOnHand: p.manageStock ? stock : undefined,
      manageStock: p.manageStock,
      unit: p.unit?.shortName ?? "",
    });
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
  }

  const cartQty = (key: string) => lines.find((l) => l.key === key)?.quantity ?? 0;

  // Enter on an exact product SKU/barcode acts as a scan.
  const exactMatch = useMemo(() => {
    const q = search.trim();
    if (!q || mode !== "PRODUCTS") return null;
    return products?.find((p) => p.sku === q || p.barcode === q) ?? null;
  }, [search, products, mode]);

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border-2 border-sky-400 bg-white p-4 shadow-sm">
      {/* Mode tabs: New Order style */}
      <div className="mb-4 flex items-center gap-6 border-b border-slate-100 pb-3">
        {(["SERVICES", "PRODUCTS"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setSearch(""); }}
            className={`pb-1 text-sm font-semibold transition ${
              mode === m ? "border-b-2 border-sky-500 text-sky-600" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {m === "SERVICES" ? (isAr ? "الخدمات" : "Services") : isAr ? "المنتجات" : "Products"}
          </button>
        ))}
        <div className="ms-auto w-56">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && exactMatch) {
                addProduct(exactMatch);
                setSearch("");
              }
            }}
            placeholder={mode === "SERVICES" ? (isAr ? "بحث" : "Search") : isAr ? "بحث / SKU / باركود" : "Search / SKU / barcode"}
            className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {mode === "SERVICES" ? (
          <>
            <CategoryPill active={!svcCategoryId} onClick={() => setSvcCategoryId("")} label={isAr ? "الكل" : "All"} />
            {svcCategories?.map((c) => (
              <CategoryPill
                key={c.id}
                active={svcCategoryId === c.id}
                onClick={() => setSvcCategoryId(c.id)}
                label={isAr ? c.nameAr || c.nameEn : c.nameEn}
              />
            ))}
          </>
        ) : (
          <>
            <CategoryPill active={!prodCategoryId} onClick={() => setProdCategoryId("")} label={isAr ? "الكل" : "All"} />
            {categories?.map((c) => (
              <CategoryPill
                key={c.id}
                active={prodCategoryId === c.id}
                onClick={() => setProdCategoryId(c.id)}
                label={isAr ? c.nameAr || c.nameEn : c.nameEn}
              />
            ))}
            {brands && brands.length > 0 && (
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-sky-400 focus:outline-none"
              >
                <option value="">{isAr ? "كل العلامات" : "All Brands"}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{isAr ? b.nameAr || b.nameEn : b.nameEn}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {/* Item tile grid */}
      <div className="grid flex-1 auto-rows-max grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 xl:grid-cols-5">
        {mode === "SERVICES" ? (
          <>
            {svcLoading && <p className="col-span-full py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}
            {!svcLoading && (services?.length ?? 0) === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-slate-400">
                {isAr ? "لا توجد خدمات. أضف خدمات من صفحة الخدمات." : "No services yet. Add services from the Services page."}
              </div>
            )}
            {services?.map((s) => {
              const key = `SERVICE:${s.id}`;
              const qty = cartQty(key);
              return (
                <ItemTile
                  key={s.id}
                  icon={iconFor(s.category?.nameEn)}
                  name={isAr ? s.nameAr || s.nameEn : s.nameEn}
                  price={formatMoney(s.price, currency, locale)}
                  qty={qty}
                  onAdd={() => addService(s)}
                  onInc={() => incQty(key)}
                  onDec={() => decQty(key)}
                />
              );
            })}
          </>
        ) : (
          <>
            {prodLoading && <p className="col-span-full py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>}
            {!prodLoading && (products?.length ?? 0) === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-slate-400">{isAr ? "لا توجد منتجات." : "No products."}</div>
            )}
            {products?.map((p) => {
              const stock = locationStock(p);
              const out = p.manageStock && stock <= 0;
              const low = p.manageStock && stock > 0 && stock <= 5;
              const key = `PRODUCT:${p.id}`;
              const qty = cartQty(key);
              return (
                <ItemTile
                  key={p.id}
                  image={p.image}
                  name={isAr ? p.nameAr || p.nameEn : p.nameEn}
                  price={formatMoney(p.sellingPrice, currency, locale)}
                  qty={qty}
                  disabled={out}
                  stockBadge={p.manageStock ? (out ? (isAr ? "نفد" : "Out") : String(stock)) : undefined}
                  stockTone={out ? "danger" : low ? "warn" : "normal"}
                  onAdd={() => addProduct(p)}
                  onInc={() => incQty(key)}
                  onDec={() => decQty(key)}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
});

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? "bg-sky-500 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

interface ItemTileProps {
  name: string;
  price: string;
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  icon?: string;
  image?: string | null;
  disabled?: boolean;
  stockBadge?: string;
  stockTone?: "normal" | "warn" | "danger";
}

/** A single garment/item tile: icon or photo, name, price, and a quantity badge once in the cart. */
function ItemTile({ name, price, qty, onAdd, onInc, onDec, icon, image, disabled, stockBadge, stockTone = "normal" }: ItemTileProps) {
  const inCart = qty > 0;
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white text-start transition ${
        inCart ? "border-sky-400 ring-1 ring-sky-300" : "border-slate-200 hover:border-sky-300 hover:shadow-sm"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <button
        onClick={onAdd}
        disabled={disabled}
        className="flex h-16 w-full items-center justify-center bg-gradient-to-br from-sky-50 to-slate-100 text-3xl disabled:cursor-not-allowed"
      >
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : icon ?? "📦"}
      </button>

      {stockBadge && (
        <span
          className={`absolute end-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            stockTone === "danger" ? "bg-red-100 text-red-700" : stockTone === "warn" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
          }`}
        >
          {stockBadge}
        </span>
      )}

      {inCart && (
        <span className="absolute bottom-9 start-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1 text-[11px] font-bold text-white shadow">
          {qty}
        </span>
      )}

      <div className="flex flex-1 flex-col px-2 pb-2 pt-1">
        <span className="line-clamp-2 text-xs font-medium text-slate-800">{name}</span>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="ltr-nums text-sm font-semibold text-sky-700">{price}</span>
          {inCart && (
            <div className="flex items-center gap-1">
              <button onClick={onDec} className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600 hover:bg-slate-200">
                −
              </button>
              <button onClick={onInc} className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-xs text-sky-700 hover:bg-sky-200">
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
