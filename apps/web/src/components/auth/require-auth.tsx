"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ROUTES } from "../../lib/routes";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`${ROUTES.login}${next}`);
    }
  }, [isAuthenticated, isReady, pathname, router]);

  if (!isReady) {
    return <p>Loading session...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
