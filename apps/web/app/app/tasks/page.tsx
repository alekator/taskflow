"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listWorkspaceTasks,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceTask,
} from "../../../src/lib/tasks/api";
import { getErrorDetails } from "../../../src/lib/errors";

const taskStatuses: Array<"ALL" | TaskStatus> = [
  "ALL",
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
];
const taskPriorities: Array<"ALL" | TaskPriority> = [
  "ALL",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];

function getPriorityBadgeClass(priority: TaskPriority) {
  switch (priority) {
    case "URGENT":
      return "badge-priority-urgent";
    case "HIGH":
      return "badge-priority-high";
    case "MEDIUM":
      return "badge-priority-medium";
    default:
      return "badge-priority-low";
  }
}

function formatStatus(status: TaskStatus) {
  return status === "IN_PROGRESS" ? "In progress" : status.toLowerCase();
}

function assigneeLabel(task: WorkspaceTask) {
  if (!task.assignee) return "Unassigned";
  return task.assignee.name || task.assignee.email;
}

export default function TasksPage() {
  const [items, setItems] = useState<WorkspaceTask[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyPulse, setApplyPulse] = useState(false);
  const applyPulseTimeoutRef = useRef<number | null>(null);

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | TaskStatus>("ALL");
  const [priority, setPriority] = useState<"ALL" | TaskPriority>("ALL");

  const query = useMemo(
    () => ({
      page,
      limit,
      search: submittedSearch || undefined,
      status: status === "ALL" ? undefined : status,
      priority: priority === "ALL" ? undefined : priority,
      sortBy: "updatedAt" as const,
      sortOrder: "desc" as const,
    }),
    [limit, page, priority, status, submittedSearch],
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listWorkspaceTasks(query);
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
  }, [query]);

  useEffect(() => {
    return () => {
      if (applyPulseTimeoutRef.current !== null) {
        window.clearTimeout(applyPulseTimeoutRef.current);
      }
    };
  }, []);

  const resetFilters = () => {
    setPage(1);
    setSearch("");
    setSubmittedSearch("");
    setStatus("ALL");
    setPriority("ALL");
  };

  const onApply = () => {
    setPage(1);
    setSubmittedSearch(search.trim());
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
        <h1>Tasks</h1>
        <p>All tasks in your visible workspace scope across projects.</p>
      </header>

      <section className="item-card board-filters board-filters-toolbar-thin workspace-tasks-filters">
        <div className="workspace-tasks-filters-row">
          <div className="workspace-tasks-filters-title">
            <span className="meta">Filters</span>
            <span className="badge badge-neutral">Workspace</span>
            <span className="badge badge-ok">Found {total}</span>
          </div>

          <label className="board-filter-inline-label board-filter-search">
            <span>Search</span>
            <input
              value={search}
              placeholder="Title, description, project"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="board-filter-inline-label">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as "ALL" | TaskStatus);
              }}
            >
              {taskStatuses.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "All statuses" : formatStatus(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="board-filter-inline-label">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => {
                setPage(1);
                setPriority(event.target.value as "ALL" | TaskPriority);
              }}
            >
              {taskPriorities.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "All priorities" : item}
                </option>
              ))}
            </select>
          </label>

          <div className="workspace-tasks-filters-actions">
            <button
              className={`button button-primary button-compact${applyPulse ? " button-pulse" : ""}`}
              type="button"
              onClick={onApply}
            >
              Apply
            </button>
            <button
              className="button button-ghost button-compact"
              type="button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
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

      {!loading && items.length === 0 ? (
        <div className="empty-state">No tasks found for current filters.</div>
      ) : null}

      {items.length > 0 ? (
        <section className="workspace-task-list">
          {items.map((task) => (
            <article className="item-card workspace-task-card" key={task.id}>
              <div className="workspace-task-card-main">
                <div className="workspace-task-title-row">
                  <strong>{task.title}</strong>
                  <span className={`badge ${getPriorityBadgeClass(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
                <p className="workspace-task-project">
                  Project:{" "}
                  <Link href={`/app/projects/${task.project.id}`} className="workspace-row-action">
                    {task.project.name}
                  </Link>
                </p>
                <p className="workspace-task-description">
                  {task.description || "No description"}
                </p>
              </div>

              <div className="workspace-task-meta">
                <span className="badge badge-neutral">{formatStatus(task.status)}</span>
                <span className="meta">Assignee: {assigneeLabel(task)}</span>
                <span className="meta">Version: v{task.version}</span>
                <span className="meta">
                  Updated:{" "}
                  {new Date(task.updatedAt).toLocaleDateString()}{" "}
                  {new Date(task.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <Link
                  href={`/app/projects/${task.project.id}?tab=board`}
                  className="workspace-row-action"
                >
                  Open board
                </Link>
              </div>
            </article>
          ))}
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
