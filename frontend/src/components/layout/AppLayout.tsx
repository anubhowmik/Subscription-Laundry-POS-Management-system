import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TrialBanner } from "./TrialBanner";
import { Header } from "./Header";
import { Footer } from "./Footer";

/**
 * Every level below Header is an explicit flex-1 chain (not plain block auto-height) so a
 * definite height reaches all the way down to the page content - PosPage's own root relies on
 * `h-full` to lay out its terminal grid, and percentage heights only resolve against a parent
 * with a definite (not content-derived) height. Footer lives *inside* the scrollable `main`,
 * right after `Outlet`, so it never steals fixed viewport space from Sidebar/Topbar/page
 * content - it just appears at the true end of the scrollable area, same as every other page
 * that already uses Header+Footer (AuthLayout, Billing).
 */
export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <TrialBanner />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col">
              <div className="flex-1 p-4 pb-24 md:p-8 md:pb-32">
                <Outlet />
              </div>
              <Footer />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
