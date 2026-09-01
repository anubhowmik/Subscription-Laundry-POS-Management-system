import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  label: string;
  prevAriaLabel?: string;
  nextAriaLabel?: string;
}

export function Pagination({ page, totalPages, onPrev, onNext, label, prevAriaLabel = "Previous page", nextAriaLabel = "Next page" }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
      <button
        disabled={page <= 1}
        onClick={onPrev}
        aria-label={prevAriaLabel}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={2} aria-hidden />
      </button>
      <span className="ltr-nums text-slate-500">{label}</span>
      <button
        disabled={page >= totalPages}
        onClick={onNext}
        aria-label={nextAriaLabel}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4 rtl:rotate-180" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
