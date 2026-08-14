import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, Customer } from "../../types/api";

interface Props {
  value: Customer | null;
  onChange: (customer: Customer) => void;
}

export function CustomerPicker({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Customer[]>>("/customers", { params: { search: query, limit: 10 } });
      return res.data.data;
    },
    enabled: open,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName = value ? (i18n.resolvedLanguage === "ar" ? value.nameAr || value.nameEn : value.nameEn) : "";

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{t("pos.customer")}</label>
      <input
        value={open ? query : displayName}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={t("common.search")}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {(data ?? []).length === 0 && <p className="px-3 py-2 text-sm text-slate-400">{t("common.noResults")}</p>}
          {(data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">
                {i18n.resolvedLanguage === "ar" ? c.nameAr || c.nameEn : c.nameEn}
              </span>
              <span className="ltr-nums text-xs text-slate-500">
                {c.code} · {c.phone}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
