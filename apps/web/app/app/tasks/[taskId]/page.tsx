"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TaskRoadmapPanel } from "../../../../src/components/tasks/task-roadmap-panel";
import { getErrorDetails } from "../../../../src/lib/errors";
import {
  listProjectMembers,
  type ProjectMember,
} from "../../../../src/lib/projects/api";
import {
  assignProjectTask,
  getWorkspaceTask,
  unassignProjectTask,
  updateProjectTask,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceTask,
} from "../../../../src/lib/tasks/api";

function formatStatus(status: WorkspaceTask["status"]) {
  return status === "IN_PROGRESS" ? "In progress" : status.toLowerCase();
}

export default function TaskDetailsPage() {
  const params = useParams<{ taskId: string }>();
  const taskId = params.taskId;

  const [task, setTask] = useState<WorkspaceTask | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [statusValue, setStatusValue] = useState<TaskStatus>("TODO");
  const [priorityValue, setPriorityValue] = useState<TaskPriority>("MEDIUM");
  const [assigneeIdValue, setAssigneeIdValue] = useState("");

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

  useEffect(() => {
    if (!task) return;
    setStatusValue(task.status);
    setPriorityValue(task.priority);
    setAssigneeIdValue(task.assignee?.id ?? "");
    setUpdateError(null);
  }, [task]);

  useEffect(() => {
    if (!task) return;

    const run = async () => {
      try {
        const response = await listProjectMembers(task.project.id, {
          page: 1,
          limit: 100,
          sortBy: "createdAt",
          sortOrder: "asc",
        });
        setMembers(response.items);
      } catch {
        setMembers([]);
      }
    };

    void run();
  }, [task]);

  const onSaveTaskMeta = async () => {
    if (!task || updating) return;

    setUpdating(true);
    setUpdateError(null);

    try {
      if (statusValue !== task.status || priorityValue !== task.priority) {
        await updateProjectTask(task.project.id, task.id, task.version, {
          status: statusValue,
          priority: priorityValue,
        });
      }

      const currentAssigneeId = task.assignee?.id ?? "";
      if (assigneeIdValue !== currentAssigneeId) {
        if (assigneeIdValue) {
          await assignProjectTask(task.project.id, task.id, assigneeIdValue);
        } else {
          await unassignProjectTask(task.project.id, task.id);
        }
      }

      const refreshedTask = await getWorkspaceTask(task.id);
      setTask(refreshedTask);
    } catch (err) {
      const details = getErrorDetails(err);
      setUpdateError(details.message);
    } finally {
      setUpdating(false);
    }
  };

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
          <Link
            href={`/app/projects/${task.project.id}`}
            className="workspace-row-action"
          >
            {task.project.name}
          </Link>
        </p>
      </header>

      <section className="item-card">
        <div className="toolbar">
          <span className="badge badge-neutral">
            {formatStatus(task.status)}
          </span>
          <span className="badge badge-neutral">{task.priority}</span>
          <span className="meta">Version: v{task.version}</span>
        </div>
        <div className="task-description-grid">
          <div className="task-description-block">
            <h2>Description</h2>
            <p>{task.description || "No description yet."}</p>
          </div>

          <aside className="task-description-block task-todo-block">
            <div className="task-quick-actions-card">
              <div className="task-quick-actions-head">
                <h2>Quick actions</h2>
                <p className="meta">
                  Update task state directly from this page.
                </p>
              </div>

              <div className="task-quick-actions-section">
                <span className="task-quick-actions-label">Status</span>
                <div className="task-status-pills">
                  {(["TODO", "IN_PROGRESS", "TESTING", "DONE"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        type="button"
                        className={`button button-compact task-status-btn ${statusValue === status ? "task-status-btn-active" : ""}`}
                        onClick={() => setStatusValue(status)}
                      >
                        {formatStatus(status)}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="task-quick-actions-fields">
                <label className="form-label">
                  <span className="task-quick-actions-label">Priority</span>
                  <select
                    value={priorityValue}
                    onChange={(event) =>
                      setPriorityValue(event.target.value as TaskPriority)
                    }
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </label>

                <label className="form-label">
                  <span className="task-quick-actions-label">Assignee</span>
                  <select
                    value={assigneeIdValue}
                    onChange={(event) => setAssigneeIdValue(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name || member.user.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {updateError ? <p className="error-text">{updateError}</p> : null}

              <button
                type="button"
                className="button button-compact task-save-btn"
                onClick={() => void onSaveTaskMeta()}
                disabled={updating}
              >
                {updating ? "Saving..." : "Save changes"}
              </button>
            </div>
          </aside>
        </div>
      </section>

      <TaskRoadmapPanel taskId={task.id} />
    </div>
  );
}
