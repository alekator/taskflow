"use client";

import { useEffect, useMemo, useState } from "react";
import { listAuditLogs, type AuditLog } from "../../../src/lib/audit/api";

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
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load audit logs");
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [query]);

  return (
    <>
      <h1>Audit Logs</h1>
      <p>Admin-only forensic timeline with request correlation fields.</p>

      <div
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          marginTop: 14,
        }}
      >
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

      {error ? (
        <p className="error-text" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
      {loading ? <p style={{ marginTop: 10 }}>Loading logs...</p> : null}

      <ul style={{ display: "grid", gap: 10, listStyle: "none", marginTop: 12 }}>
        {items.map((log) => (
          <li key={log.id} className="card" style={{ minHeight: "unset", padding: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <strong>{log.action}</strong>
              <span style={{ color: "var(--ink-700)", fontSize: 14 }}>
                {new Date(log.createdAt).toLocaleString()} • entity: {log.entityType || "n/a"} • id: {log.entityId || "n/a"}
              </span>
              <span style={{ color: "var(--ink-700)", fontSize: 13 }}>
                actor: {log.actorUserId || "n/a"} • request: {log.requestId || "n/a"}
              </span>
              <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
                hash: {(log.hash || "n/a").slice(0, 16)}... • prev: {(log.prevHash || "n/a").slice(0, 16)}...
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div style={{ alignItems: "center", display: "flex", gap: 10, marginTop: 12 }}>
        <button
          className="button button-ghost"
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Prev
        </button>
        <span style={{ color: "var(--ink-700)", fontWeight: 700 }}>
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
    </>
  );
}
