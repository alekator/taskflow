"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  addProjectMember,
  getProject,
  listProjectMembers,
  removeProjectMember,
  type Project,
  type ProjectMember,
  type ProjectRole,
} from "../../../../src/lib/projects/api";
import {
  assignProjectTask,
  createProjectTask,
  deleteProjectTask,
  listProjectTasks,
  unassignProjectTask,
  updateProjectTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../../../src/lib/tasks/api";
import { useProjectRealtime } from "../../../../src/lib/realtime/use-project-realtime";

const roles: ProjectRole[] = ["OWNER", "MANAGER", "MEMBER"];
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const taskPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

type RealtimeEvent = {
  type: string;
  timestamp: string;
};

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("MEMBER");
  const [memberPending, setMemberPending] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("MEDIUM");
  const [taskCreatePending, setTaskCreatePending] = useState(false);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);

  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };

    for (const task of tasks) {
      groups[task.status].push(task);
    }

    for (const status of taskStatuses) {
      groups[status].sort((a, b) => a.order - b.order);
    }

    return groups;
  }, [tasks]);

  const load = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setError("Missing project id in route");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [projectData, membersData, tasksData] = await Promise.all([
        getProject(projectId),
        listProjectMembers(projectId, {
          page: 1,
          limit: 50,
          sortBy: "createdAt",
          sortOrder: "asc",
        }),
        listProjectTasks(projectId, {
          page: 1,
          limit: 100,
          sortBy: "order",
          sortOrder: "asc",
        }),
      ]);
      setProject(projectData);
      setMembers(membersData.items);
      setTasks(tasksData.items);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load project details");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useProjectRealtime(
    projectId,
    (event) => {
      setEvents((prev) => [{ type: event.type, timestamp: event.timestamp }, ...prev].slice(0, 8));
      void load();
    },
    (event) => {
      setEvents((prev) => [{ type: event.type, timestamp: event.timestamp }, ...prev].slice(0, 8));
      void load();
    },
  );

  const onAddMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newUserId.trim() || !projectId) return;

    setMemberPending(true);
    setError(null);

    try {
      await addProjectMember(projectId, {
        userId: newUserId.trim(),
        role: newRole,
      });
      setNewUserId("");
      setNewRole("MEMBER");
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to add member");
      }
    } finally {
      setMemberPending(false);
    }
  };

  const onRemoveMember = async (userId: string) => {
    if (!projectId) return;

    setMemberPending(true);
    setError(null);

    try {
      await removeProjectMember(projectId, userId);
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to remove member");
      }
    } finally {
      setMemberPending(false);
    }
  };

  const onCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectId || !newTaskTitle.trim()) return;

    setTaskCreatePending(true);
    setError(null);

    try {
      const order = tasks.length > 0 ? Math.max(...tasks.map((task) => task.order)) + 1 : 1;

      await createProjectTask(projectId, {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        priority: newTaskPriority,
        order,
      });

      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("MEDIUM");
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create task");
      }
    } finally {
      setTaskCreatePending(false);
    }
  };

  const onChangeTaskStatus = async (task: Task, status: TaskStatus) => {
    if (!projectId) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      await updateProjectTask(projectId, task.id, task.version, { status });
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update task status");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  const onChangeTaskPriority = async (task: Task, priority: TaskPriority) => {
    if (!projectId) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      await updateProjectTask(projectId, task.id, task.version, { priority });
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update task priority");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  const onAssignTask = async (task: Task, assigneeId: string) => {
    if (!projectId) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      if (assigneeId) {
        await assignProjectTask(projectId, task.id, assigneeId);
      } else {
        await unassignProjectTask(projectId, task.id);
      }
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to assign task");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  const onDeleteTask = async (task: Task) => {
    if (!projectId) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      await deleteProjectTask(projectId, task.id, task.version);
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete task");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  const onMoveTaskToStatus = async (task: Task, targetStatus: TaskStatus) => {
    if (!projectId || task.status === targetStatus) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      const targetColumn = groupedTasks[targetStatus];
      const nextOrder =
        targetColumn.length > 0
          ? Math.max(...targetColumn.map((item) => item.order)) + 1
          : 1;

      await updateProjectTask(projectId, task.id, task.version, {
        status: targetStatus,
        order: nextOrder,
      });
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to move task");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  const onMoveTaskWithinStatus = async (task: Task, direction: "up" | "down") => {
    if (!projectId) return;

    const currentColumn = groupedTasks[task.status];
    const index = currentColumn.findIndex((item) => item.id === task.id);
    if (index < 0) return;

    const neighborIndex = direction === "up" ? index - 1 : index + 1;
    const neighbor = currentColumn[neighborIndex];
    if (!neighbor) return;

    setTaskActionId(task.id);
    setError(null);

    try {
      await Promise.all([
        updateProjectTask(projectId, task.id, task.version, { order: neighbor.order }),
        updateProjectTask(projectId, neighbor.id, neighbor.version, { order: task.order }),
      ]);
      await load();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to reorder task");
      }
    } finally {
      setTaskActionId(null);
    }
  };

  if (loading) {
    return <p className="soft">Loading project...</p>;
  }

  return (
    <div className="stack">
      <header className="panel-header">
        <h1>{project?.name ?? "Project"}</h1>
        <p>{project?.description || "No description"}</p>
        <p className="meta">Project ID: {projectId || "n/a"}</p>
      </header>

      <h2 style={{ fontFamily: "var(--font-heading)", marginTop: 18 }}>Realtime</h2>
      <ul className="list">
        {events.length === 0 ? (
          <li className="empty-state">No live events yet</li>
        ) : (
          events.map((event, index) => (
            <li key={`${event.type}-${event.timestamp}-${index}`} className="item-card">
              {new Date(event.timestamp).toLocaleTimeString()} • {event.type}
            </li>
          ))
        )}
      </ul>

      <form className="auth-form" onSubmit={onAddMember}>
        <label>
          User ID
          <input
            placeholder="Paste user id"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            required
          />
        </label>

        <label>
          Role
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as ProjectRole)}
            style={{ minHeight: 42 }}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <button className="button button-primary" type="submit" disabled={memberPending}>
          {memberPending ? "Saving..." : "Add member"}
        </button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}

      <h2 style={{ fontFamily: "var(--font-heading)", marginTop: 18 }}>Members</h2>
      {members.length === 0 ? (
        <div className="empty-state">No members in this project yet.</div>
      ) : null}
      <ul className="list">
        {members.map((member) => (
          <li key={member.userId} className="item-card">
            <div className="stack">
              <strong>{member.user.name || member.user.email}</strong>
              <span className="soft">{member.user.email}</span>
              <span className="meta">
                {member.role} • {member.userId}
              </span>
              <button
                className="button button-ghost"
                type="button"
                disabled={memberPending || member.role === "OWNER"}
                onClick={() => void onRemoveMember(member.userId)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <h2 style={{ fontFamily: "var(--font-heading)", marginTop: 22 }}>Tasks</h2>

      {tasks.length > 0 ? (
        <section className="kanban">
          {taskStatuses.map((status) => (
            <article key={status} className="kanban-column">
              <h3>
                {taskStatusLabels[status]} ({groupedTasks[status].length})
              </h3>

              {groupedTasks[status].length === 0 ? (
                <p className="meta">No tasks</p>
              ) : (
                <ul className="kanban-list">
                  {groupedTasks[status].map((task, index) => {
                    const busy = taskActionId === task.id;
                    const assignee = task.assigneeId
                      ? membersById.get(task.assigneeId)
                      : null;

                    return (
                      <li key={task.id} className="kanban-item">
                        <strong>{task.title}</strong>
                        <span className="meta">
                          #{task.order} • {task.priority} • v{task.version}
                        </span>
                        <span className="soft">
                          {assignee
                            ? `Assignee: ${assignee.user.name || assignee.user.email}`
                            : "Unassigned"}
                        </span>
                        <div className="kanban-actions">
                          <button
                            className="button-micro"
                            type="button"
                            disabled={busy || index === 0}
                            onClick={() => void onMoveTaskWithinStatus(task, "up")}
                          >
                            Up
                          </button>
                          <button
                            className="button-micro"
                            type="button"
                            disabled={busy || index === groupedTasks[status].length - 1}
                            onClick={() => void onMoveTaskWithinStatus(task, "down")}
                          >
                            Down
                          </button>
                          <button
                            className="button-micro"
                            type="button"
                            disabled={busy || status === "TODO"}
                            onClick={() =>
                              void onMoveTaskToStatus(
                                task,
                                status === "DONE" ? "IN_PROGRESS" : "TODO",
                              )
                            }
                          >
                            Left
                          </button>
                          <button
                            className="button-micro"
                            type="button"
                            disabled={busy || status === "DONE"}
                            onClick={() =>
                              void onMoveTaskToStatus(
                                task,
                                status === "TODO" ? "IN_PROGRESS" : "DONE",
                              )
                            }
                          >
                            Right
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </section>
      ) : null}

      <form className="auth-form" onSubmit={onCreateTask}>
        <label>
          Task title
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            minLength={1}
            required
          />
        </label>

        <label>
          Description
          <input
            value={newTaskDescription}
            onChange={(e) => setNewTaskDescription(e.target.value)}
          />
        </label>

        <label>
          Priority
          <select
            value={newTaskPriority}
            onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
            style={{ minHeight: 42 }}
          >
            {taskPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <button className="button button-primary" type="submit" disabled={taskCreatePending}>
          {taskCreatePending ? "Creating..." : "Create task"}
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="empty-state">No tasks yet. Create the first task for this project.</div>
      ) : null}
      <ul className="list">
        {tasks.map((task) => {
          const busy = taskActionId === task.id;
          const assignee = task.assigneeId ? membersById.get(task.assigneeId) : null;

          return (
            <li key={task.id} className="item-card">
              <div className="stack">
                <strong>{task.title}</strong>
                <span className="soft">
                  {task.description || "No description"}
                </span>
                <span className="meta">
                  version {task.version} • order {task.order}
                </span>

                <div className="columns-auto">
                  <label>
                    Status
                    <select
                      value={task.status}
                      onChange={(e) =>
                        void onChangeTaskStatus(task, e.target.value as TaskStatus)
                      }
                      disabled={busy}
                      style={{ minHeight: 40 }}
                    >
                      {taskStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Priority
                    <select
                      value={task.priority}
                      onChange={(e) =>
                        void onChangeTaskPriority(task, e.target.value as TaskPriority)
                      }
                      disabled={busy}
                      style={{ minHeight: 40 }}
                    >
                      {taskPriorities.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Assignee
                    <select
                      value={task.assigneeId || ""}
                      onChange={(e) => void onAssignTask(task, e.target.value)}
                      disabled={busy}
                      style={{ minHeight: 40 }}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.user.name || member.user.email} ({member.role})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <span className="soft">
                  Current assignee: {assignee ? assignee.user.name || assignee.user.email : "none"}
                </span>

                <button
                  className="button button-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void onDeleteTask(task)}
                >
                  {busy ? "Working..." : "Delete task"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
