"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ROUTES } from "../../lib/routes";

export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isReady, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isReady) return;
    if (isAuthenticated) {
      const next = searchParams.get("next") || ROUTES.app;
      router.replace(next);
    }
  }, [isAuthenticated, isReady, router, searchParams]);

  if (!isReady) return <p>Loading session...</p>;
  if (isAuthenticated) return null;

  return <>{children}</>;
}
