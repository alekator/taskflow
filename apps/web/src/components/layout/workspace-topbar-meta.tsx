"use client";

import Link from "next/link";
import { useAuth } from "../auth/auth-provider";

export function WorkspaceContextMeta() {
  const { user } = useAuth();
  const canViewWorkspaceActivity = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canViewWorkspaceUsers = Boolean(user);

  return (
    <div className="workspace-context">
      <span className="workspace-context-label">Team workspace</span>
      <strong>
        {canViewWorkspaceUsers
          ? "Projects, tasks, users, activity"
          : canViewWorkspaceActivity
            ? "Projects, tasks, activity"
            : "Projects, tasks"}
      </strong>
    </div>
  );
}

export function WorkspaceTopbarLinks() {
  const { user } = useAuth();
  const canViewWorkspaceActivity = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canViewWorkspaceUsers = Boolean(user);

  return (
    <div className="workspace-topbar-right">
      <Link href="/app/projects" className="workspace-toplink">
        Open projects
      </Link>
      <Link href="/app/tasks" className="workspace-toplink">
        Tasks
      </Link>
      {canViewWorkspaceUsers ? (
        <Link href="/app/users" className="workspace-toplink">
          Users
        </Link>
      ) : null}
      {canViewWorkspaceActivity ? (
        <Link href="/app/audit" className="workspace-toplink">
          Activity
        </Link>
      ) : null}
    </div>
  );
}
