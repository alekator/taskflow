import Link from "next/link";

const highlights = [
  "Tamper-evident audit trail",
  "Idempotent write operations",
  "Optimistic concurrency control",
  "Realtime project updates",
];

const proof = [
  { label: "Backend suites", value: "7/7 passed" },
  { label: "E2E checks", value: "46/46 passed" },
  { label: "API docs", value: "Swagger + typed contracts" },
];

export default function Home() {
  return (
    <main className="landing">
      <header className="topbar">
        <p className="brand">TaskFlow</p>
        <nav className="nav">
          <Link href="/auth/login">Sign in</Link>
          <Link href="/app" className="button button-primary">
            Open app
          </Link>
        </nav>
      </header>

      <section className="hero">
        <p className="kicker">Production-ready portfolio project</p>
        <h1>Task management platform with enterprise-grade backend guarantees.</h1>
        <p className="lead">
          Frontend is being built block-by-block on top of secure APIs with audit,
          concurrency safety, and realtime collaboration.
        </p>
        <div className="hero-actions">
          <Link href="/app/projects" className="button button-primary">
            Explore workspace
          </Link>
          <Link href="/app/audit" className="button button-ghost">
            View audit panel
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Core Guarantees</h2>
          <ul>
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h2>Validation Proof</h2>
          <ul className="proof-list">
            {proof.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
