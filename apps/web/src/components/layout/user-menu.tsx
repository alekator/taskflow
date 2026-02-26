"use client";

import { useAuth } from "../auth/auth-provider";

export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="user-menu">
      <div className="user-menu-meta">
        <strong>{user?.name ?? "Workspace user"}</strong>
        <span>{user?.email ?? "Unknown user"}</span>
      </div>
      <button type="button" className="button button-ghost button-compact" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  );
}
