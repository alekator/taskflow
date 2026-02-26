import type { ReactNode } from "react";
import Link from "next/link";
import { RequireAuth } from "../../src/components/auth/require-auth";
import { AppSidebarNav } from "../../src/components/layout/app-sidebar-nav";
import { UserMenu } from "../../src/components/layout/user-menu";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <Link href="/app" className="brand brand-light">
              TaskFlow
            </Link>
            <div className="workspace-context">
              <span className="workspace-context-label">Team workspace</span>
              <strong>Projects, tasks, activity</strong>
            </div>
          </div>
          <div className="workspace-topbar-right">
            <Link href="/app/projects" className="workspace-toplink">
              Open projects
            </Link>
            <Link href="/app/audit" className="workspace-toplink">
              Activity
            </Link>
          </div>
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
      </div>
    </RequireAuth>
  );
}
