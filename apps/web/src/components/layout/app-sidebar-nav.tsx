"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Overview" },
  { href: "/app/projects", label: "Projects" },
  { href: "/app/audit", label: "Activity" },
] as const;

export function AppSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <p className="workspace-section-label">Workspace</p>
      <ul>
        {items.map((item) => {
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

