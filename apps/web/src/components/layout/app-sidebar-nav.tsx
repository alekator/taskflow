"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../auth/auth-provider";

const items = [
  { href: "/app", label: "Overview", adminOnly: false },
  { href: "/app/projects", label: "Projects", adminOnly: false },
  { href: "/app/tasks", label: "Tasks", adminOnly: false },
  { href: "/app/audit", label: "Activity", adminOnly: true },
] as const;

export function AppSidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const canViewWorkspaceActivity =
    user?.role === "ADMIN" || user?.role === "MANAGER";
  const visibleItems = items.filter(
    (item) => !item.adminOnly || canViewWorkspaceActivity,
  );

  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <p className="workspace-section-label">Workspace</p>
      <ul>
        {visibleItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/app" && pathname.startsWith(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={active ? "workspace-link workspace-link-active" : "workspace-link"}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
