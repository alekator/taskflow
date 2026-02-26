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
            <Link href="/" className="brand brand-light">
              TaskFlow
            </Link>
          </header>

          <section className="login-layout">
            <article className="panel auth-panel">
              <h1>Sign in</h1>
              <p>
                Access your workspace, open project boards, and continue active work.
              </p>
              <Suspense fallback={<p className="soft">Loading auth form...</p>}>
                <LoginForm />
              </Suspense>
            </article>

            <aside className="item-card login-aside">
              <h2>Local access</h2>
              <p className="soft">
                Seeded admin credentials are available for local development.
              </p>
              <div className="login-credentials">
                <span className="meta">Email</span>
                <strong>admin@test.com</strong>
                <span className="meta">Password</span>
                <strong>123456</strong>
              </div>
              <p className="meta">
                After sign in you will land in the main workspace at <code>/app</code>.
              </p>
            </aside>
          </section>
        </main>
      </GuestOnly>
    </Suspense>
  );
}
