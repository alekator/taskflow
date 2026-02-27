import { Suspense } from "react";
import Link from "next/link";
import { GuestOnly } from "../../../src/components/auth/guest-only";
import { RegisterForm } from "../../../src/components/auth/register-form";
import { ROUTES } from "../../../src/lib/routes";

export default function RegisterPage() {
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
              <h1>Create account</h1>
              <p>
                Register with login and password, then open your workspace.
              </p>
              <Suspense fallback={<p className="soft">Loading registration form...</p>}>
                <RegisterForm />
              </Suspense>
              <p className="meta auth-switch-link">
                Already have an account? <Link href={ROUTES.login}>Sign in</Link>
              </p>
            </article>

            <aside className="item-card login-aside">
              <h2>Role model</h2>
              <p className="soft">
                Everyone can register as Owner/Member. Manager and Admin require invite codes.
              </p>
              <div className="login-credentials">
                <span className="meta">Owner / Member</span>
                <strong>No code required</strong>
                <span className="meta">Manager / Admin</span>
                <strong>Invite code required</strong>
              </div>
              <p className="meta">
                Invite codes are configured via backend env vars.
              </p>
            </aside>
          </section>
        </main>
      </GuestOnly>
    </Suspense>
  );
}
