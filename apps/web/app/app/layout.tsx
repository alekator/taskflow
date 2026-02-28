import type { ReactNode } from "react";
import Link from "next/link";
import { RequireAuth } from "../../src/components/auth/require-auth";
import { WorkspaceAssistant } from "../../src/components/assistant/workspace-assistant";
import { AppSidebarNav } from "../../src/components/layout/app-sidebar-nav";
import { WorkspaceAmbientStage } from "../../src/components/layout/workspace-ambient-stage";
import { UserMenu } from "../../src/components/layout/user-menu";
import {
  WorkspaceContextMeta,
  WorkspaceTopbarLinks,
} from "../../src/components/layout/workspace-topbar-meta";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <Link href="/app" className="brand brand-light">
              TaskFlow
            </Link>
            <WorkspaceContextMeta />
          </div>
          <WorkspaceTopbarLinks />
        </header>

        <main className="shell">
          <div className="shell-grid shell-grid-workspace">
            <aside className="sidebar workspace-sidebar">
              <AppSidebarNav />
              <UserMenu />
            </aside>

            <section className="panel workspace-panel">{children}</section>
          </div>
        </main>
        <WorkspaceAmbientStage />
        <WorkspaceAssistant />
      </div>
    </RequireAuth>
  );
}
