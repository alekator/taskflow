import Link from "next/link";
import { GuestOnly } from "../../../src/components/auth/guest-only";
import { LoginForm } from "../../../src/components/auth/login-form";

export default function LoginPage() {
  return (
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
          <LoginForm />
        </section>
      </main>
    </GuestOnly>
  );
}
