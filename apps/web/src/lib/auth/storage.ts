import type { AuthSession } from "../types";

const storageKey = "taskflow.session";

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

export function readSession(): AuthSession | null {
  if (!canUseBrowserStorage()) return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession): void {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

export function clearSession(): void {
  if (!canUseBrowserStorage()) return;
  window.localStorage.removeItem(storageKey);
}
