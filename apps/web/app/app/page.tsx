"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listAuditLogs, type AuditLog } from "../../src/lib/audit/api";
import { listProjects } from "../../src/lib/projects/api";

type OverviewStats = {
  projects: number;
  auditEvents: number;
  lastAuditAt: string | null;
};

export default function AppHomePage() {
  const [stats, setStats] = useState<OverviewStats>({
    projects: 0,
    auditEvents: 0,
    lastAuditAt: null,
  });
  const [recentAudit, setRecentAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [projectsRes, auditRes] = await Promise.all([
          listProjects({ page: 1, limit: 1 }),
          listAuditLogs({ page: 1, limit: 5 }),
        ]);

        setStats({
          projects: projectsRes.meta.total,
          auditEvents: auditRes.meta.total,
          lastAuditAt: auditRes.items[0]?.createdAt ?? null,
        });
        setRecentAudit(auditRes.items);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load overview metrics");
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const readinessItems = [
    { label: "At least 1 project", ok: stats.projects > 0 },
    { label: "Audit pipeline active", ok: stats.auditEvents > 0 },
    { label: "Auth-protected shell", ok: true },
  ];

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Workspace Overview</h1>
        <p>Live portfolio dashboard for architecture, reliability, and traceability.</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="soft">Loading metrics...</p> : null}

      <section className="columns-3">
        <article className="stat-card">
          <strong>{stats.projects}</strong>
          <p className="soft">Projects in workspace</p>
        </article>
        <article className="stat-card">
          <strong>{stats.auditEvents}</strong>
          <p className="soft">Audit events captured</p>
        </article>
        <article className="stat-card">
          <strong>{stats.lastAuditAt ? new Date(stats.lastAuditAt).toLocaleTimeString() : "n/a"}</strong>
          <p className="soft">Last audit timestamp</p>
        </article>
      </section>

      <section className="overview-grid">
        <article className="item-card">
          <h2>Readiness</h2>
          <ul className="list">
            {readinessItems.map((item) => (
              <li key={item.label} className="readiness-row">
                <span className="soft">{item.label}</span>
                <span className={`badge ${item.ok ? "badge-ok" : "badge-pending"}`}>
                  {item.ok ? "OK" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="item-card">
          <h2>Recent Audit</h2>
          {recentAudit.length === 0 ? (
            <div className="empty-state">No audit events yet</div>
          ) : (
            <ul className="list">
              {recentAudit.map((log) => (
                <li key={log.id} className="readiness-row">
                  <span className="soft">{log.action}</span>
                  <span className="meta">{new Date(log.createdAt).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
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
