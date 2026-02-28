"use client";

import Link from "next/link";

export function WorkspaceContextMeta() {
  return (
    <div className="workspace-context">
      <span className="workspace-context-label">Team workspace</span>
    </div>
  );
}

export function WorkspaceTopbarLinks() {
  return (
    <div className="workspace-topbar-right">
      <Link href="/" className="workspace-toplink workspace-toplink-home">
        Home
      </Link>
    </div>
  );
}
