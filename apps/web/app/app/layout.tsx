import type { ReactNode } from "react";
import Link from "next/link";
import { RequireAuth } from "../../src/components/auth/require-auth";
import { UserMenu } from "../../src/components/layout/user-menu";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <main className="shell">
        <div className="shell-grid">
          <aside className="sidebar">
            <p className="brand">TaskFlow</p>
            <ul>
              <li>
                <Link href="/app">Overview</Link>
              </li>
              <li>
                <Link href="/app/projects">Projects</Link>
              </li>
              <li>
                <Link href="/app/audit">Audit logs</Link>
              </li>
            </ul>
            <UserMenu />
          </aside>

          <section className="panel">{children}</section>
        </div>
      </main>
    </RequireAuth>
  );
}
