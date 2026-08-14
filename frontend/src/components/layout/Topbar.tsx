import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ChangePasswordModal } from "../auth/ChangePasswordModal";

export function Topbar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { locations, currentLocationId, setCurrentLocationId } = useBusinessLocation();
  const [showChangePassword, setShowChangePassword] = useState(false);

  function toggleLanguage() {
    i18n.changeLanguage(i18n.resolvedLanguage === "ar" ? "en" : "ar");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-3">
        {locations.length > 0 && (
          <select
            value={currentLocationId ?? ""}
            onChange={(e) => setCurrentLocationId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.branchName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleLanguage}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {i18n.resolvedLanguage === "ar" ? "English" : "العربية"}
        </button>
        <button
          onClick={() => setShowChangePassword(true)}
          className="hidden text-end sm:block"
          title="Change password"
        >
          <p className="text-sm font-medium text-slate-800 hover:underline">{user?.fullNameEn}</p>
          <p className="text-xs text-slate-500">{user?.username}</p>
        </button>
        <button
          onClick={() => logout()}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          {t("nav.logout")}
        </button>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </header>
  );
}
