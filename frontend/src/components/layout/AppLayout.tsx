import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TrialBanner } from "./TrialBanner";
import { Header } from "./Header";
import { Footer, CURVE_HEIGHT } from "./Footer";

/**
 * The app frame (Header + Sidebar + page) is exactly one screen tall, and the full Footer sits
 * *below* it at full width - under the sidebar as well as the page - at the very end of the
 * document. The outer div is the page's scroll container: the sidebar nav and `main` keep their
 * own scrolling, and once either reaches its end the scroll carries on to the outer container and
 * reveals the footer, so it never takes screen space while working.
 *
 * Every level below Header is an explicit flex-1 chain (not plain block auto-height) so a
 * definite height reaches all the way down to the page content - PosPage's own root relies on
 * `h-full` to lay out its terminal grid, and percentage heights only resolve against a parent
 * with a definite (not content-derived) height.
 */
/** Empty space between the bottom of the app frame and the top of the footer's curve. */
const FOOTER_GAP = 48;

export function AppLayout() {
  return (
    <div className="h-dvh overflow-y-auto bg-slate-50">
      <div className="flex h-dvh flex-col">
        <Header sticky={false} />
        {/* Bottom border closes off the white sidebar, so it reads as ending above the footer. */}
        <div className="flex min-h-0 flex-1 border-b border-slate-200">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <TrialBanner />
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col">
                <div className="flex-1 p-4 md:p-8">
                  <Outlet />
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      {/* Room for the footer's curved top edge (it rises CURVE_HEIGHT above the footer) plus a clear
          gap - without it the white curve meets the white sidebar and they read as one shape. */}
      <div style={{ height: CURVE_HEIGHT + FOOTER_GAP }} aria-hidden />
      <Footer />
    </div>
  );
}
