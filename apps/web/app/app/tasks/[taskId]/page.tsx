"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getWorkspaceTask, type WorkspaceTask } from "../../../../src/lib/tasks/api";
import { getErrorDetails } from "../../../../src/lib/errors";

function formatStatus(status: WorkspaceTask["status"]) {
  return status === "IN_PROGRESS" ? "In progress" : status.toLowerCase();
}

export default function TaskDetailsPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;

  const [task, setTask] = useState<WorkspaceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!taskId) {
        setError("Missing task id in route");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await getWorkspaceTask(taskId);
        setTask(response);
      } catch (err) {
        const details = getErrorDetails(err);
        setError(details.message);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [taskId]);

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-lg" />
        <div className="skeleton" />
      </div>
    );
  }

  if (error || !task) {
    return <p className="error-text">{error || "Task not found"}</p>;
  }

  return (
    <div className="stack">
      <header className="panel-header">
        <p className="meta">
          <Link href="/app/tasks" className="workspace-row-action">
            Tasks
          </Link>{" "}
          / {task.project.name}
        </p>
        <h1>{task.title}</h1>
        <p>
          Project:{" "}
          <Link href={`/app/projects/${task.project.id}`} className="workspace-row-action">
            {task.project.name}
          </Link>
        </p>
      </header>

      <section className="item-card">
        <div className="toolbar">
          <span className="badge badge-neutral">{formatStatus(task.status)}</span>
          <span className="badge badge-neutral">{task.priority}</span>
          <span className="meta">Version: v{task.version}</span>
        </div>
        <p>{task.description || "No description yet."}</p>
      </section>
    </div>
  );
}

