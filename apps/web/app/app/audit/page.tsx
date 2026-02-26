"use client";

import { useEffect, useMemo, useState } from "react";
import { listAuditLogs, type AuditLog } from "../../../src/lib/audit/api";
import { getErrorDetails } from "../../../src/lib/errors";

export default function AuditPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [requestId, setRequestId] = useState("");
  const [entityType, setEntityType] = useState("");

  const query = useMemo(
    () => ({
      page,
      limit,
      action: action.trim() || undefined,
      requestId: requestId.trim() || undefined,
      entityType: entityType.trim() || undefined,
    }),
    [action, entityType, limit, page, requestId],
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listAuditLogs(query);
        setItems(res.items);
        setTotalPages(res.meta.totalPages);
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [query]);

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Workspace Activity</h1>
        <p>Administrative event history with request IDs, entity traces, and hash chain metadata.</p>
      </header>

      <section className="columns-3">
        <article className="stat-card">
          <strong>{items.length}</strong>
          <p className="soft">Visible events</p>
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

      <section className="item-card board-filters">
        <div className="panel-header panel-header-inline">
          <h2>Filters</h2>
          <button
            className="button button-ghost button-compact"
            type="button"
            onClick={() => {
              setPage(1);
              setAction("");
              setEntityType("");
              setRequestId("");
            }}
          >
            Reset
          </button>
        </div>

        <div className="columns-auto">
          <label>
            Action
            <input
              placeholder="TASK_DELETE"
              value={action}
              onChange={(e) => {
                setPage(1);
                setAction(e.target.value);
              }}
            />
          </label>
          <label>
            Entity type
            <input
              placeholder="task or project"
              value={entityType}
              onChange={(e) => {
                setPage(1);
                setEntityType(e.target.value);
              }}
            />
          </label>
          <label>
            Request ID
            <input
              placeholder="Request correlation id"
              value={requestId}
              onChange={(e) => {
                setPage(1);
                setRequestId(e.target.value);
              }}
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
              <li key={log.id} className="activity-item">
                <div className="activity-dot activity-dot-muted" />
                <div className="activity-copy">
                  <div className="audit-row">
                    <strong>{log.action}</strong>
                    <span className="meta">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="soft">
                    entity: {log.entityType || "n/a"} - {log.entityId || "n/a"}
                  </p>
                  <p className="soft">
                    actor: {log.actorUserId || "n/a"} - request: {log.requestId || "n/a"}
                  </p>
                  <p className="meta">
                    hash: {(log.hash || "n/a").slice(0, 16)}... - prev: {(log.prevHash || "n/a").slice(0, 16)}...
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
