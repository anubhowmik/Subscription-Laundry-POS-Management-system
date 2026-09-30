import { useState } from "react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { inputClass } from "../../components/ui/formClasses";

export interface ProductPick {
  id: string;
  nameEn: string;
  nameAr: string;
  sku: string;
}

export function useProductPicker() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductPick[]>([]);
  const [picked, setPicked] = useState<ProductPick | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<ProductPick[]>>("/products", { params: { search: value, limit: 8 } });
    setResults(res.data.data);
  }

  function select(p: ProductPick) {
    setPicked(p);
    setSearch("");
    setResults([]);
  }

  return { search, results, picked, select, runSearch, reset: () => { setSearch(""); setResults([]); setPicked(null); } };
}

export function ProductSearchField({ isAr, picker }: { isAr: boolean; picker: ReturnType<typeof useProductPicker> }) {
  return (
    <div className="relative">
      <input
        value={picker.picked ? (isAr ? picker.picked.nameAr || picker.picked.nameEn : picker.picked.nameEn) : picker.search}
        onChange={(e) => picker.runSearch(e.target.value)}
        placeholder={isAr ? "ابحث عن منتج..." : "Search for a product..."}
        className={inputClass}
      />
      {picker.results.length > 0 && !picker.picked && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-sm">
          {picker.results.map((p) => (
            <button
              key={p.id}
              onClick={() => picker.select(p)}
              className="block w-full px-3 py-1.5 text-start text-sm transition-colors hover:bg-slate-100"
            >
              {isAr ? p.nameAr || p.nameEn : p.nameEn} <span className="ltr-nums text-xs text-slate-400">({p.sku})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
