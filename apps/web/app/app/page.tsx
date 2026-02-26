import Link from "next/link";

export default function AppHomePage() {
  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Workspace Overview</h1>
        <p>Production-focused shell with auth guards and live backend modules.</p>
      </header>

      <section className="columns-3">
        <article className="stat-card">
          <strong>Projects</strong>
          <p className="soft">Create and manage project spaces with members and roles.</p>
        </article>
        <article className="stat-card">
          <strong>Tasks</strong>
          <p className="soft">Track status, priority, assignee, and optimistic updates.</p>
        </article>
        <article className="stat-card">
          <strong>Audit</strong>
          <p className="soft">Inspect tamper-evident timeline and request correlation.</p>
        </article>
      </section>

      <section className="toolbar">
        <Link className="button button-primary" href="/app/projects">
          Open projects
        </Link>
        <Link className="button button-ghost" href="/app/audit">
          Open audit logs
        </Link>
      </section>
    </div>
  );
}
