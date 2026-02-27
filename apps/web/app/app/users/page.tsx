"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/components/auth/auth-provider";
import {
  listWorkspaceUsers,
  type WorkspaceUser,
} from "../../../src/lib/users/api";
import { getErrorDetails } from "../../../src/lib/errors";

type UserRoleFilter = "ALL" | "ADMIN" | "MANAGER" | "USER";

const roleFilters: UserRoleFilter[] = ["ALL", "ADMIN", "MANAGER", "USER"];

function roleLabel(role: WorkspaceUser["role"]) {
  if (role === "ADMIN") return "Admin";
  if (role === "MANAGER") return "Manager";
  return "User";
}

function roleBadgeClass(role: WorkspaceUser["role"]) {
  if (role === "ADMIN") return "badge-critical";
  if (role === "MANAGER") return "badge-warning";
  return "badge-neutral";
}

export default function UsersPage() {
  const { user, isReady } = useAuth();
  const router = useRouter();
  const canViewUsers = Boolean(user);
  const [items, setItems] = useState<WorkspaceUser[]>([]);
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
  const [role, setRole] = useState<UserRoleFilter>("ALL");

  const query = useMemo(
    () => ({
      page,
      limit,
      search: submittedSearch || undefined,
      role: role === "ALL" ? undefined : role,
      sortBy: "createdAt" as const,
      sortOrder: "desc" as const,
    }),
    [limit, page, role, submittedSearch],
  );

  useEffect(() => {
    if (!isReady) return;
    if (!canViewUsers) {
      router.replace("/app");
    }
  }, [canViewUsers, isReady, router]);

  useEffect(() => {
    if (!canViewUsers) return;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listWorkspaceUsers(query);
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
  }, [canViewUsers, query]);

  useEffect(() => {
    return () => {
      if (applyPulseTimeoutRef.current !== null) {
        window.clearTimeout(applyPulseTimeoutRef.current);
      }
    };
  }, []);

  if (!isReady || !canViewUsers) {
    return null;
  }

  const resetFilters = () => {
    setPage(1);
    setSearch("");
    setSubmittedSearch("");
    setRole("ALL");
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
        <h1>Users</h1>
        <p>Registered accounts in workspace with project scope and workload metrics.</p>
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
              placeholder="Email or name"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="board-filter-inline-label">
            <span>Role</span>
            <select
              value={role}
              onChange={(event) => {
                setPage(1);
                setRole(event.target.value as UserRoleFilter);
              }}
            >
              {roleFilters.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "All roles" : roleLabel(item as WorkspaceUser["role"])}
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
        <div className="empty-state">No users found for current filters.</div>
      ) : null}

      {items.length > 0 ? (
        <section className="workspace-task-list">
          {items.map((item) => (
            <article className="item-card workspace-task-card" key={item.id}>
              <div className="workspace-task-card-main">
                <div className="workspace-user-head">
                  <div className="workspace-user-headline">
                    <strong>{item.name || item.email}</strong>
                    <span className="meta">{item.email}</span>
                  </div>
                  <span className={`badge ${roleBadgeClass(item.role)}`}>
                    {roleLabel(item.role)}
                  </span>
                </div>
                <p className="meta workspace-user-id">ID: {item.id}</p>
                <p className="workspace-task-description">
                  Projects:{" "}
                  {item.projects.length > 0
                    ? item.projects.map((project) => project.name).join(", ")
                    : "No project memberships yet"}
                </p>
              </div>

              <div className="workspace-task-meta">
                <span className="meta">Projects: {item.projectCount}</span>
                <span className="meta">Active tasks: {item.activeTasksCount}</span>
                <span className="meta">Completed tasks: {item.completedTasksCount}</span>
                <span className="meta">Total assigned: {item.totalTasksCount}</span>
                <span className="meta">
                  Registered: {new Date(item.createdAt).toLocaleDateString()}
                </span>
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
