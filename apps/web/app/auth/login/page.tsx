import { Suspense } from "react";
import Link from "next/link";
import { GuestOnly } from "../../../src/components/auth/guest-only";
import { LoginForm } from "../../../src/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="landing"><p className="soft">Loading auth flow...</p></main>}>
      <GuestOnly>
        <main className="landing">
          <header className="topbar">
            <Link href="/" className="brand">
              TaskFlow
            </Link>
          </header>

          <section className="panel auth-panel">
            <h1>Sign in</h1>
            <p>
              Use seeded credentials (for local demo): <strong>admin@test.com</strong>
              / <strong>123456</strong>.
            </p>
            <Suspense fallback={<p className="soft">Loading auth form...</p>}>
              <LoginForm />
            </Suspense>
          </section>
        </main>
      </GuestOnly>
    </Suspense>
  );
}
