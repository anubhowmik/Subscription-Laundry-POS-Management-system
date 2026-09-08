import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useCurrentApp } from "../../components/layout/Sidebar";
import { PageHeader } from "../../components/ui/PageHeader";
import { ModuleCard } from "../../components/appHome/ModuleCard";
import { CardGridSection } from "../../components/appHome/CardGridSection";
import { pickAccent } from "../../lib/cardPalette";

/**
 * The new "landing view" for every application (2026-09-08 design overhaul) - what you see first
 * after opening an app from Home, instead of jumping straight into a content page. Renders a
 * mockup-style multi-color card grid built directly from the SAME section/item data the Sidebar
 * already uses (see useCurrentApp() in Sidebar.tsx) - never a hand-duplicated card list, so it
 * can't drift out of sync with what's actually in the sidebar. One instance of this component is
 * reused for every app (mounted with a distinct `key` per app in App.tsx to force a clean remount
 * when switching apps); ZATCA is the one app exempted (single page, routed straight to /zatca).
 */
export default function AppLandingPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const { pathname } = useLocation();
  const app = useCurrentApp();

  if (!app) return null;

  let cardIndex = 0;

  return (
    <div className="space-y-10">
      <PageHeader title={t(app.labelKey)} subtitle={t(`home.apps.${app.key}.description`)} />

      {app.sections.map((section) => {
        // The item that links back to this very landing page (see Sidebar.tsx's "nav.modules"
        // entries) is excluded here - a card that just navigates to the page you're already on
        // would be dead weight, not a real module.
        const items = section.items.filter((item) => item.to !== pathname && (!item.permissions || can(...item.permissions)));
        if (items.length === 0) return null;
        return (
          <CardGridSection key={section.labelKey} title={t(section.labelKey)}>
            {items.map((item) => {
              const accent = pickAccent(cardIndex);
              const delayMs = (cardIndex % 8) * 40;
              cardIndex += 1;
              return (
                <ModuleCard
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  title={t(item.labelKey)}
                  accentColor={accent}
                  exploreLabel={t("common.explore")}
                  delayMs={delayMs}
                />
              );
            })}
          </CardGridSection>
        );
      })}
    </div>
  );
}
