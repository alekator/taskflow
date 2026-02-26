"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  listProjects,
  type Project,
} from "../../../src/lib/projects/api";
import { useToast } from "../../../src/components/feedback/toast-provider";
import { getErrorDetails } from "../../../src/lib/errors";

export default function ProjectsPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPending, setCreatePending] = useState(false);

  const query = useMemo(
    () => ({
      page,
      limit,
      search: submittedSearch,
      sortBy: "createdAt" as const,
      sortOrder: "desc" as const,
    }),
    [limit, page, submittedSearch],
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listProjects(query);
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

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createName.trim()) return;

    setCreatePending(true);
    setError(null);

    try {
      await createProject({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
      });

      setCreateName("");
      setCreateDescription("");

      const refreshed = await listProjects({
        page: 1,
        limit,
        search: submittedSearch,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setItems(refreshed.items);
      setTotalPages(refreshed.meta.totalPages);
      setPage(1);
      notify("success", "Project created");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>Projects</h1>
        <p>Open an existing workspace or create a new project for your team.</p>
      </header>

      <section className="projects-layout">
        <aside className="item-card project-create-panel">
          <div className="stack stack-sm">
            <div>
              <h2>New project</h2>
              <p className="soft">
                Start a focused board for a team, client, or internal workflow.
              </p>
            </div>

            <form className="auth-form auth-form-compact" onSubmit={onCreate}>
              <label>
                Project name
                <input
                  data-testid="project-name-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  minLength={1}
                  placeholder="Website relaunch"
                  required
                />
              </label>
              <label>
                Description
                <input
                  data-testid="project-description-input"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Scope, team, or current objective"
                />
              </label>
              <button
                data-testid="project-create-submit"
                className="button button-primary"
                type="submit"
                disabled={createPending}
              >
                {createPending ? "Creating..." : "Create project"}
              </button>
            </form>
          </div>
        </aside>

        <section className="stack">
          <div className="projects-toolbar">
            <div>
              <h2>Project index</h2>
              <p className="soft">
                {loading ? "Loading projects..." : `${items.length} shown on this page`}
              </p>
            </div>

            <div className="toolbar project-searchbar">
              <input
                data-testid="project-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or description"
              />
              <button
                data-testid="project-search-apply"
                className="button button-ghost"
                type="button"
                onClick={() => {
                  setPage(1);
                  setSubmittedSearch(search.trim());
                }}
              >
                Apply
              </button>
            </div>
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
            <div className="empty-state">
              No projects found. Create a new one or adjust your filters.
            </div>
          ) : null}

          <div className="projects-list-shell">
            <div className="projects-list-header">
              <span>Name</span>
              <span>Description</span>
              <span>Updated</span>
              <span>Actions</span>
            </div>

            <ul className="projects-rows">
              {items.map((project) => (
                <li
                  key={project.id}
                  className="projects-row"
                  data-testid="project-item"
                >
                  <div className="projects-row-main">
                    <strong>{project.name}</strong>
                    <span className="meta">v{project.version}</span>
                  </div>
                  <div className="projects-row-description">
                    <span className="soft">
                      {project.description || "No description"}
                    </span>
                  </div>
                  <div className="projects-row-updated">
                    <span className="meta">
                      {new Date(project.updatedAt).toLocaleDateString()}{" "}
                      {new Date(project.updatedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="projects-row-actions">
                    <Link
                      href={`/app/projects/${project.id}`}
                      className="workspace-row-action"
                      data-testid={`project-link-${project.id}`}
                    >
                      Open board
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>

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
        </section>
      </section>
    </div>
  );
}

