"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../../src/components/auth/auth-provider";
import { WorkspacePulseCanvas } from "../../src/components/overview/workspace-pulse-canvas";
import { listAuditLogs, type AuditLog } from "../../src/lib/audit/api";
import { getErrorDetails } from "../../src/lib/errors";
import { listProjects, type Project } from "../../src/lib/projects/api";
import { getRuntimeHealth, type RuntimeHealth } from "../../src/lib/system/api";
import { listWorkspaceTasks, type WorkspaceTask } from "../../src/lib/tasks/api";

type OverviewStats = {
  projects: number;
  auditEvents: number;
  lastAuditAt: string | null;
};

function formatUptime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function serviceBadgeClass(status: RuntimeHealth["services"]["database"]) {
  return status === "CONNECTED"
    ? "badge-ok"
    : status === "UNAVAILABLE"
      ? "badge-pending"
      : "badge-pending";
}

function serviceLabel(status: RuntimeHealth["services"]["database"]) {
  return status === "CONNECTED"
    ? "Connected"
    : status === "UNAVAILABLE"
      ? "Unavailable"
      : "Not configured";
}

function heapPressureBadgeClass(percent: number) {
  if (percent >= 90) return "badge-critical";
  if (percent >= 75) return "badge-warning";
  return "badge-ok";
}

export default function AppHomePage() {
  const { user } = useAuth();
  const canViewWorkspaceActivity =
    user?.role === "ADMIN" || user?.role === "MANAGER";
  const [stats, setStats] = useState<OverviewStats>({
    projects: 0,
    auditEvents: 0,
    lastAuditAt: null,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTask[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLog[]>([]);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [projectsRes, tasksRes, runtimeHealth] = await Promise.all([
          listProjects({
            page: 1,
            limit: 4,
            sortBy: "createdAt",
            sortOrder: "desc",
          }),
          listWorkspaceTasks({
            page: 1,
            limit: 24,
            sortBy: "updatedAt",
            sortOrder: "desc",
          }),
          getRuntimeHealth(),
        ]);

        setRecentProjects(projectsRes.items);
        setWorkspaceTasks(tasksRes.items);
        setHealth(runtimeHealth);

        if (canViewWorkspaceActivity) {
          const auditRes = await listAuditLogs({ page: 1, limit: 5 });
          setStats({
            projects: projectsRes.meta.total,
            auditEvents: auditRes.meta.total,
            lastAuditAt: auditRes.items[0]?.createdAt ?? null,
          });
          setRecentAudit(auditRes.items);
        } else {
          setStats({
            projects: projectsRes.meta.total,
            auditEvents: 0,
            lastAuditAt: null,
          });
          setRecentAudit([]);
        }
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [canViewWorkspaceActivity]);

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
          <strong>{canViewWorkspaceActivity ? stats.auditEvents : stats.projects}</strong>
          <p className="soft">{canViewWorkspaceActivity ? "Recorded activity events" : "Accessible projects"}</p>
        </article>
        <article className="stat-card">
          <strong>
            {canViewWorkspaceActivity
              ? stats.lastAuditAt
                ? new Date(stats.lastAuditAt).toLocaleTimeString()
                : "n/a"
              : user?.role ?? "USER"}
          </strong>
          <p className="soft">{canViewWorkspaceActivity ? "Last tracked update" : "Access level"}</p>
        </article>
      </section>

      <section className="overview-grid">
        <article className="item-card telemetry-card">
          <div className="panel-header panel-header-inline overview-card-header">
            <h2>Runtime telemetry</h2>
            <span className="badge badge-ok">{health?.status ?? "n/a"}</span>
          </div>
          <div className="overview-telemetry-intro">
            <h3>Operational Readout</h3>
            <p className="soft">
              Live health signals across runtime, memory pressure, database responsiveness,
              and realtime service availability.
            </p>
          </div>
          <ul className="list telemetry-list">
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Backend uptime</span>
              <strong className="telemetry-value">{health ? formatUptime(health.runtime.uptimeSeconds) : "n/a"}</strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Node runtime</span>
              <strong className="telemetry-value">
                {health ? `${health.runtime.nodeVersion} | ${health.runtime.environment}` : "n/a"}
              </strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Process ID</span>
              <strong className="telemetry-value">{health ? health.runtime.pid : "n/a"}</strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Memory RSS</span>
              <strong className="telemetry-value">{health ? `${health.memory.rssMb} MB` : "n/a"}</strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Heap pressure</span>
              {health ? (
                <div className="telemetry-value telemetry-value-stack">
                  <span className={`badge ${heapPressureBadgeClass(health.memory.heapUsagePercent)}`}>
                    {health.memory.heapUsagePercent}%
                  </span>
                  <strong>{`${health.memory.heapUsedMb} / ${health.memory.heapTotalMb} MB`}</strong>
                </div>
              ) : (
                <strong className="telemetry-value">n/a</strong>
              )}
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">External memory</span>
              <strong className="telemetry-value">{health ? `${health.memory.externalMb} MB` : "n/a"}</strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Database</span>
              <span className={`badge ${health ? serviceBadgeClass(health.services.database) : "badge-pending"}`}>
                {health ? serviceLabel(health.services.database) : "n/a"}
              </span>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">DB latency</span>
              <strong className="telemetry-value">
                {health?.services.databaseLatencyMs != null
                  ? `${health.services.databaseLatencyMs} ms`
                  : "n/a"}
              </strong>
            </li>
            <li className="readiness-row readiness-row-telemetry">
              <span className="soft telemetry-label">Realtime gateway</span>
              <span className={`badge ${health ? "badge-ok" : "badge-pending"}`}>
                {health ? "Enabled" : "n/a"}
              </span>
            </li>
          </ul>
        </article>

        <article className="item-card workspace-pulse-card">
          <div className="panel-header panel-header-inline overview-card-header">
            <h2>Living Workspace Canvas</h2>
            <span className="badge badge-neutral">Live</span>
          </div>
          <WorkspacePulseCanvas
            projects={recentProjects}
            tasks={workspaceTasks}
            recentAudit={recentAudit}
          />
        </article>
      </section>

      {canViewWorkspaceActivity ? (
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
                      {log.entityType || "system"} - {log.entityId || "n/a"} - request {log.requestId || "n/a"}
                    </p>
                  </div>
                  <span className="meta">{new Date(log.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="item-card">
          <div className="panel-header panel-header-inline">
            <h2>Your workspace access</h2>
          </div>
          <div className="empty-state">
            Activity logs are limited to administrators. Use Projects to open shared boards and continue active work.
          </div>
        </section>
      )}

      <section className="toolbar">
        <Link className="button button-primary" href="/app/projects">
          Open projects
        </Link>
        {canViewWorkspaceActivity ? (
          <Link className="button button-ghost" href="/app/audit">
            Open activity
          </Link>
        ) : null}
      </section>
    </div>
  );
}

