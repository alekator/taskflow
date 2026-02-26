"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createProject,
  listProjects,
  type Project,
} from "../../../src/lib/projects/api";

export default function ProjectsPage() {
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
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load projects");
        }
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
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create project");
      }
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <>
      <h1>Projects</h1>
      <p>Live data from API with pagination and search.</p>

      <form className="auth-form" onSubmit={onCreate} style={{ marginTop: 18 }}>
        <label>
          Project name
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            minLength={1}
            required
          />
        </label>
        <label>
          Description
          <input
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={createPending}>
          {createPending ? "Creating..." : "Create project"}
        </button>
      </form>

      <div style={{ alignItems: "center", display: "flex", gap: 8, marginTop: 18 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name/description"
          style={{ flex: 1 }}
        />
        <button
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

      {error ? (
        <p className="error-text" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}
      {loading ? <p style={{ marginTop: 12 }}>Loading projects...</p> : null}

      <ul style={{ display: "grid", gap: 10, listStyle: "none", marginTop: 14 }}>
        {items.map((project) => (
          <li key={project.id} className="card" style={{ minHeight: "unset", padding: 14 }}>
            <Link href={`/app/projects/${project.id}`} style={{ display: "grid", gap: 6 }}>
              <strong>{project.name}</strong>
              <span style={{ color: "var(--ink-700)" }}>
                {project.description || "No description"}
              </span>
              <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
                version {project.version} • {new Date(project.createdAt).toLocaleString()}
              </span>
            </Link>
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

