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
        <h1>Audit Logs</h1>
        <p>Admin-only forensic timeline with request-correlation metadata.</p>
      </header>

      <div className="columns-auto">
        <input
          placeholder="Action (e.g. TASK_DELETE)"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        />
        <input
          placeholder="Entity type (task/project)"
          value={entityType}
          onChange={(e) => {
            setPage(1);
            setEntityType(e.target.value);
          }}
        />
        <input
          placeholder="Request ID"
          value={requestId}
          onChange={(e) => {
            setPage(1);
            setRequestId(e.target.value);
          }}
        />
      </div>

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

      <ul className="list">
        {items.map((log) => (
          <li key={log.id} className="item-card">
            <div className="stack">
              <strong>{log.action}</strong>
              <span className="soft">
                {new Date(log.createdAt).toLocaleString()} • entity: {log.entityType || "n/a"} • id: {log.entityId || "n/a"}
              </span>
              <span className="soft">
                actor: {log.actorUserId || "n/a"} • request: {log.requestId || "n/a"}
              </span>
              <span className="meta">
                hash: {(log.hash || "n/a").slice(0, 16)}... • prev: {(log.prevHash || "n/a").slice(0, 16)}...
              </span>
            </div>
          </li>
        ))}
      </ul>

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
