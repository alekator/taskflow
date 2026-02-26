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

  if (loading) {
    return <p>Loading project...</p>;
  }

  return (
    <>
      <h1>{project?.name ?? "Project"}</h1>
      <p>{project?.description || "No description"}</p>
      <p style={{ color: "var(--ink-500)", fontSize: 13, marginTop: 8 }}>
        Project ID: {projectId || "n/a"}
      </p>

      <h2 style={{ fontFamily: "var(--font-heading)", marginTop: 18 }}>Realtime</h2>
      <ul style={{ display: "grid", gap: 6, listStyle: "none", marginTop: 8 }}>
        {events.length === 0 ? (
          <li style={{ color: "var(--ink-500)", fontSize: 13 }}>No live events yet</li>
        ) : (
          events.map((event, index) => (
            <li key={`${event.type}-${event.timestamp}-${index}`} style={{ color: "var(--ink-700)", fontSize: 13 }}>
              {new Date(event.timestamp).toLocaleTimeString()} • {event.type}
            </li>
          ))
        )}
      </ul>

      <form className="auth-form" onSubmit={onAddMember} style={{ marginTop: 18 }}>
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

      {error ? (
        <p className="error-text" style={{ marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <h2 style={{ fontFamily: "var(--font-heading)", marginTop: 18 }}>Members</h2>
      <ul style={{ display: "grid", gap: 10, listStyle: "none", marginTop: 10 }}>
        {members.map((member) => (
          <li key={member.userId} className="card" style={{ minHeight: "unset", padding: 14 }}>
            <div style={{ alignItems: "start", display: "grid", gap: 6 }}>
              <strong>{member.user.name || member.user.email}</strong>
              <span style={{ color: "var(--ink-700)" }}>{member.user.email}</span>
              <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
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

      <form className="auth-form" onSubmit={onCreateTask} style={{ marginTop: 12 }}>
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

      <ul style={{ display: "grid", gap: 10, listStyle: "none", marginTop: 12 }}>
        {tasks.map((task) => {
          const busy = taskActionId === task.id;
          const assignee = task.assigneeId ? membersById.get(task.assigneeId) : null;

          return (
            <li key={task.id} className="card" style={{ minHeight: "unset", padding: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <strong>{task.title}</strong>
                <span style={{ color: "var(--ink-700)" }}>
                  {task.description || "No description"}
                </span>
                <span style={{ color: "var(--ink-500)", fontSize: 12 }}>
                  version {task.version} • order {task.order}
                </span>

                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
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

                <span style={{ color: "var(--ink-700)", fontSize: 13 }}>
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
    </>
  );
}
