"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/components/auth/auth-provider";
import { listAuditLogs, type AuditLog } from "../../../src/lib/audit/api";
import { getErrorDetails } from "../../../src/lib/errors";

function toIsoDateStart(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).toISOString();
}

function toIsoDateEnd(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function shortValue(value: string | null, size = 10) {
  if (!value) return "n/a";
  if (value.length <= size * 2) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

export default function AuditPage() {
  const { user, isReady } = useAuth();
  const router = useRouter();
  const canViewWorkspaceActivity =
    user?.role === "ADMIN" || user?.role === "MANAGER";
  const [items, setItems] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyPulse, setApplyPulse] = useState(false);
  const applyPulseTimeoutRef = useRef<number | null>(null);

  const [action, setAction] = useState("");
  const [requestId, setRequestId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [submittedAction, setSubmittedAction] = useState("");
  const [submittedRequestId, setSubmittedRequestId] = useState("");
  const [submittedEntityType, setSubmittedEntityType] = useState("");
  const [submittedEntityId, setSubmittedEntityId] = useState("");
  const [submittedActorUserId, setSubmittedActorUserId] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");

  const activeFilterCount = useMemo(
    () =>
      [
        submittedAction,
        submittedRequestId,
        submittedEntityType,
        submittedEntityId,
        submittedActorUserId,
        submittedFrom,
        submittedTo,
      ].filter((value) => value.trim().length > 0).length,
    [
      submittedAction,
      submittedActorUserId,
      submittedEntityId,
      submittedEntityType,
      submittedFrom,
      submittedRequestId,
      submittedTo,
    ],
  );

  const query = useMemo(
    () => ({
      page,
      limit,
      action: submittedAction.trim() || undefined,
      requestId: submittedRequestId.trim() || undefined,
      entityType: submittedEntityType.trim() || undefined,
      entityId: submittedEntityId.trim() || undefined,
      actorUserId: submittedActorUserId.trim() || undefined,
      from: toIsoDateStart(submittedFrom),
      to: toIsoDateEnd(submittedTo),
    }),
    [
      limit,
      page,
      submittedAction,
      submittedActorUserId,
      submittedEntityId,
      submittedEntityType,
      submittedFrom,
      submittedRequestId,
      submittedTo,
    ],
  );

  useEffect(() => {
    if (!isReady) return;
    if (!canViewWorkspaceActivity) {
      router.replace("/app");
    }
  }, [canViewWorkspaceActivity, isReady, router]);

  useEffect(() => {
    if (!canViewWorkspaceActivity) return;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listAuditLogs(query);
        setItems(res.items);
        setTotal(res.meta.total);
        setTotalPages(res.meta.totalPages);
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [canViewWorkspaceActivity, query]);

  useEffect(() => {
    return () => {
      if (applyPulseTimeoutRef.current !== null) {
        window.clearTimeout(applyPulseTimeoutRef.current);
      }
    };
  }, []);

  if (!isReady || !canViewWorkspaceActivity) {
    return null;
  }

  const resetFilters = () => {
    setPage(1);
    setAction("");
    setEntityType("");
    setRequestId("");
    setEntityId("");
    setActorUserId("");
    setFrom("");
    setTo("");
    setSubmittedAction("");
    setSubmittedEntityType("");
    setSubmittedRequestId("");
    setSubmittedEntityId("");
    setSubmittedActorUserId("");
    setSubmittedFrom("");
    setSubmittedTo("");
  };

  const onApply = () => {
    setPage(1);
    setSubmittedAction(action.trim());
    setSubmittedEntityType(entityType.trim());
    setSubmittedRequestId(requestId.trim());
    setSubmittedEntityId(entityId.trim());
    setSubmittedActorUserId(actorUserId.trim());
    setSubmittedFrom(from);
    setSubmittedTo(to);
    setApplyPulse(true);

    if (applyPulseTimeoutRef.current !== null) {
      window.clearTimeout(applyPulseTimeoutRef.current);
    }

    applyPulseTimeoutRef.current = window.setTimeout(() => {
      setApplyPulse(false);
      applyPulseTimeoutRef.current = null;
    }, 320);
  };

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Workspace Activity</h1>
        <p>
          Administrative event history with request IDs, entity traces, and
          hash chain metadata.
        </p>
      </header>

      <section className="columns-3">
        <article className="stat-card">
          <strong>{total}</strong>
          <p className="soft">Matched events</p>
        </article>
        <article className="stat-card">
          <strong>{page}</strong>
          <p className="soft">Current page</p>
        </article>
        <article className="stat-card">
          <strong>{totalPages}</strong>
          <p className="soft">Total pages</p>
        </article>
      </section>

      <section className="item-card board-filters board-filters-toolbar-thin workspace-audit-filters">
        <div className="workspace-audit-filters-top">
          <div className="workspace-tasks-filters-title">
            <span className="meta">Filters</span>
            <span className="badge badge-neutral">Audit</span>
            <span className="badge badge-ok">
              {activeFilterCount === 0
                ? "All events"
                : `Active ${activeFilterCount}`}
            </span>
          </div>

          <div className="workspace-tasks-filters-actions">
            <button
              className={`button button-primary button-compact${applyPulse ? " button-pulse" : ""}`}
              data-testid="audit-filter-apply"
              type="button"
              onClick={onApply}
            >
              Apply
            </button>
            <button
              className="button button-ghost button-compact"
              data-testid="audit-filter-reset"
              type="button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="workspace-audit-filters-grid">
          <label className="board-filter-inline-label workspace-audit-filter-field workspace-audit-filter-wide">
            <span>Action</span>
            <input
              data-testid="audit-filter-action"
              placeholder="TASK_DELETE"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field">
            <span>Entity type</span>
            <input
              data-testid="audit-filter-entity-type"
              placeholder="task, project, user"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field workspace-audit-filter-wide">
            <span>Request ID</span>
            <input
              data-testid="audit-filter-request-id"
              placeholder="Request correlation id"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field">
            <span>Entity ID</span>
            <input
              data-testid="audit-filter-entity-id"
              placeholder="Specific entity id"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field">
            <span>Actor user</span>
            <input
              data-testid="audit-filter-actor-user"
              placeholder="Actor user id"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field">
            <span>From date</span>
            <input
              data-testid="audit-filter-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label className="board-filter-inline-label workspace-audit-filter-field">
            <span>To date</span>
            <input
              data-testid="audit-filter-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? (
        <div className="stack">
          <div className="skeleton skeleton-lg" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <div className="empty-state">No logs found for current filters.</div>
      ) : null}

      {items.length > 0 ? (
        <section className="item-card">
          <div className="panel-header panel-header-inline">
            <h2>Event timeline</h2>
            <span className="meta">Newest first</span>
          </div>

          <ul className="activity-feed">
            {items.map((log) => (
              <li
                key={log.id}
                className="activity-item audit-timeline-item"
                data-testid="audit-event-item"
              >
                <div className="activity-dot activity-dot-muted" />
                <div className="activity-copy">
                  <div className="audit-row">
                    <div className="audit-row-main">
                      <strong className="audit-action">{log.action}</strong>
                      <div className="audit-chip-row">
                        <span className="badge badge-neutral">
                          {log.entityType || "system"}
                        </span>
                        {log.projectId ? (
                          <span className="badge badge-ok">
                            project {shortValue(log.projectId, 6)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="meta audit-time">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="audit-meta-grid">
                    <div className="audit-meta-card">
                      <span className="audit-meta-label">Entity</span>
                      <strong>{shortValue(log.entityId, 8)}</strong>
                    </div>
                    <div className="audit-meta-card">
                      <span className="audit-meta-label">Actor</span>
                      <strong>{shortValue(log.actorUserId, 8)}</strong>
                    </div>
                    <div className="audit-meta-card">
                      <span className="audit-meta-label">Request</span>
                      <strong>{shortValue(log.requestId, 8)}</strong>
                    </div>
                    <div className="audit-meta-card">
                      <span className="audit-meta-label">Chain</span>
                      <strong>{shortValue(log.hash, 6)}</strong>
                    </div>
                  </div>
                  <p className="meta audit-chain-row">
                    prev {shortValue(log.prevHash, 6)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="toolbar">
        <button
          className="button button-ghost"
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Prev
        </button>
        <span className="soft" style={{ fontWeight: 700 }}>
          Page {page} / {totalPages}
        </span>
        <button
          className="button button-ghost"
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
}
