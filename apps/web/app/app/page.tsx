"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listAuditLogs, type AuditLog } from "../../src/lib/audit/api";
import { getErrorDetails } from "../../src/lib/errors";
import { listProjects, type Project } from "../../src/lib/projects/api";

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
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [projectsRes, auditRes] = await Promise.all([
          listProjects({ page: 1, limit: 4, sortBy: "createdAt", sortOrder: "desc" }),
          listAuditLogs({ page: 1, limit: 5 }),
        ]);

        setStats({
          projects: projectsRes.meta.total,
          auditEvents: auditRes.meta.total,
          lastAuditAt: auditRes.items[0]?.createdAt ?? null,
        });
        setRecentProjects(projectsRes.items);
        setRecentAudit(auditRes.items);
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const readinessItems = [
    { label: "Projects available", ok: stats.projects > 0 },
    { label: "Activity tracking online", ok: stats.auditEvents > 0 },
    { label: "Secure sign-in enabled", ok: true },
  ];

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Workspace Overview</h1>
        <p>Track active work, recent changes, and the overall health of your workspace.</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? (
        <div className="stack">
          <div className="skeleton skeleton-lg" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : null}

      <section className="columns-3">
        <article className="stat-card">
          <strong>{stats.projects}</strong>
          <p className="soft">Projects in workspace</p>
        </article>
        <article className="stat-card">
          <strong>{stats.auditEvents}</strong>
          <p className="soft">Recorded activity events</p>
        </article>
        <article className="stat-card">
          <strong>{stats.lastAuditAt ? new Date(stats.lastAuditAt).toLocaleTimeString() : "n/a"}</strong>
          <p className="soft">Last tracked update</p>
        </article>
      </section>

      <section className="overview-grid">
        <article className="item-card">
          <h2>Workspace status</h2>
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
          <h2>Recent projects</h2>
          {recentProjects.length === 0 ? (
            <div className="empty-state">No projects yet. Create the first one to start planning.</div>
          ) : (
            <ul className="list">
              {recentProjects.map((project) => (
                <li key={project.id} className="workspace-row">
                  <div>
                    <strong>{project.name}</strong>
                    <p className="meta">{project.description || "No description"}</p>
                  </div>
                  <Link href={`/app/projects/${project.id}`} className="workspace-row-action">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="item-card">
        <div className="panel-header panel-header-inline">
          <h2>Recent activity</h2>
          <Link href="/app/audit" className="workspace-inline-link">
            See all activity
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <div className="empty-state">No activity recorded yet.</div>
        ) : (
          <ul className="list">
            {recentAudit.map((log) => (
              <li key={log.id} className="workspace-row">
                <div>
                  <strong>{log.action}</strong>
                  <p className="meta">
                    {log.entityType || "system"} • {log.entityId || "n/a"} • request {log.requestId || "n/a"}
                  </p>
                </div>
                <span className="meta">{new Date(log.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="toolbar">
        <Link className="button button-primary" href="/app/projects">
          Open projects
        </Link>
        <Link className="button button-ghost" href="/app/audit">
          Open activity
        </Link>
      </section>
    </div>
  );
}
