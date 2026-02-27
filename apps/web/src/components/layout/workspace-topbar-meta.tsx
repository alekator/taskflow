"use client";

import Link from "next/link";
import { useAuth } from "../auth/auth-provider";

export function WorkspaceContextMeta() {
  const { user } = useAuth();
  const canViewWorkspaceActivity =
    user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="workspace-context">
      <span className="workspace-context-label">Team workspace</span>
      <strong>{canViewWorkspaceActivity ? "Projects, tasks, activity" : "Projects, tasks"}</strong>
    </div>
  );
}

export function WorkspaceTopbarLinks() {
  const { user } = useAuth();
  const canViewWorkspaceActivity =
    user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="workspace-topbar-right">
      <Link href="/app/projects" className="workspace-toplink">
        Open projects
      </Link>
      <Link href="/app/tasks" className="workspace-toplink">
        Tasks
      </Link>
      {canViewWorkspaceActivity ? (
        <Link href="/app/audit" className="workspace-toplink">
          Activity
        </Link>
      ) : null}
    </div>
  );
}
