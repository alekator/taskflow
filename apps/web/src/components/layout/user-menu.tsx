"use client";

import { useAuth } from "../auth/auth-provider";

export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="user-menu">
      <span>{user?.email ?? "Unknown user"}</span>
      <button type="button" className="button button-ghost" onClick={() => void logout()}>
        Logout
      </button>
    </div>
  );
}
