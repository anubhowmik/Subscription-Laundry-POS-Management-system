import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, Building2, ChevronDown, Check } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { useMobileNavStore } from "../../stores/mobileNavStore";
import { ChangePasswordModal } from "../auth/ChangePasswordModal";
import type { BusinessLocation } from "../../types/api";

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0]!.toUpperCase();
}

function branchLabel(loc: BusinessLocation, isAr: boolean) {
  return (isAr && loc.branchNameAr) || loc.branchName;
}

/**
 * A branded icon-tile + eyebrow/name pair, same visual language as the profile button beside it
 * (icon tile, stacked text) instead of a bare native <select> - opens a proper panel with a
 * subtitle per branch (city/code) and a checkmark on the active one, closes on outside click,
 * Escape, or picking a branch.
 */
function BranchSwitcher() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { locations, currentLocation, currentLocationId, setCurrentLocationId } = useBusinessLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (locations.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("nav.switchBranch")}
        className={`group relative flex items-center gap-2 overflow-hidden rounded-lg border py-1.5 ps-1.5 pe-2 transition-all duration-200 ${
          open
            ? "border-sky-300 bg-sky-50/60 shadow-[0_4px_14px_-6px_rgba(56,189,248,0.45)]"
            : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
        }`}
      >
        {/* Same hover glow-bloom technique as StatCard - a blurred clone of the accent color
            blooming in behind the icon tile, so the control feels alive rather than static. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -start-3 -top-4 h-14 w-14 rounded-full bg-sky-300 opacity-0 blur-xl transition-all duration-500 ease-out group-hover:scale-125 group-hover:opacity-30"
        />
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-all duration-200 ${
            open ? "scale-105 bg-sky-500 text-white shadow-sm" : "bg-sky-50 text-sky-600 group-hover:bg-sky-100"
          }`}
        >
          <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <span className="relative hidden flex-col items-start leading-none sm:flex">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("nav.branch")}</span>
          <span className="mt-0.5 max-w-[160px] truncate text-sm font-semibold text-slate-800">
            {currentLocation ? branchLabel(currentLocation, isAr) : ""}
          </span>
        </span>
        <ChevronDown
          className={`relative h-4 w-4 shrink-0 transition-all duration-200 ${
            open ? "rotate-180 text-sky-500" : "text-slate-400 group-hover:text-sky-500"
          }`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {open && (
        <div className="animate-fade-slide-up absolute end-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="h-1 bg-gradient-to-r from-sky-300 via-sky-400 to-sky-300" aria-hidden />
          <div className="py-1.5">
            {locations.map((loc) => {
              const active = loc.id === currentLocationId;
              const subtitle = [loc.city, loc.branchCode].filter(Boolean).join(" · ");
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => {
                    setCurrentLocationId(loc.id);
                    setOpen(false);
                  }}
                  className={`group/row relative flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors ${
                    active ? "bg-sky-50" : "hover:bg-slate-50"
                  }`}
                >
                  {active && <span aria-hidden className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-sky-500" />}
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all duration-200 ${
                      active
                        ? "bg-sky-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-400 group-hover/row:scale-105 group-hover/row:bg-sky-100 group-hover/row:text-sky-600"
                    }`}
                  >
                    <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${active ? "text-sky-700" : "text-slate-700"}`}>
                      {branchLabel(loc, isAr)}
                    </span>
                    {subtitle && (
                      <span className={`block truncate text-xs ${active ? "text-sky-500/80" : "text-slate-400"}`}>{subtitle}</span>
                    )}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-sky-600" strokeWidth={2.5} aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toggleMobileNav = useMobileNavStore((s) => s.toggle);
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={toggleMobileNav}
          aria-label={t("nav.menu")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <BranchSwitcher />
        <button
          onClick={() => setShowChangePassword(true)}
          title={t("auth.changePassword", { defaultValue: "Change password" })}
          className="flex cursor-pointer items-center gap-2 rounded-lg py-1 ps-1 pe-2.5 hover:bg-slate-100"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
            {initials(user?.fullNameEn)}
          </span>
          <span className="hidden text-start sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-800">{user?.fullNameEn}</span>
            <span className="block text-xs leading-tight text-slate-500">{user?.username}</span>
          </span>
        </button>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </header>
  );
}
