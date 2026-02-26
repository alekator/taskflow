import Link from "next/link";

const highlights = [
  "Projects, members, and tasks in one workspace",
  "Live updates for project activity",
  "Audit trail for critical actions",
  "Safe writes with conflict protection",
];

const operatingModel = [
  { label: "Best for", value: "small teams and internal workflows" },
  { label: "Approach", value: "simple boards, fast actions, no heavy setup" },
  { label: "Foundation", value: "typed API, audit, realtime, concurrency safety" },
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
        <p className="kicker">Simple task management for growing teams</p>
        <h1>TaskFlow keeps projects clear, fast, and easy to run.</h1>
        <p className="lead">
          A lightweight project workspace for small companies that need boards,
          members, activity history, and reliable task updates without the weight
          of a large enterprise suite.
        </p>
        <div className="hero-actions">
          <Link href="/app" className="button button-primary">
            Open workspace
          </Link>
          <Link href="/auth/login" className="button button-ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>What Teams Get</h2>
          <ul>
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="card">
          <h2>Operating Model</h2>
          <ul className="proof-list">
            {operatingModel.map((item) => (
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
