"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
import { listAuditLogs, type AuditLog } from "../../../../src/lib/audit/api";
import { useProjectRealtime } from "../../../../src/lib/realtime/use-project-realtime";
import { useToast } from "../../../../src/components/feedback/toast-provider";
import { useAuth } from "../../../../src/components/auth/auth-provider";
import { getErrorDetails } from "../../../../src/lib/errors";

const roles: ProjectRole[] = ["OWNER", "MANAGER", "MEMBER"];
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const taskPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
const workspaceTabs = ["board", "members", "activity"] as const;
type WorkspaceTab = (typeof workspaceTabs)[number];

type RealtimeEvent = {
  type: string;
  timestamp: string;
};

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return value === "board" || value === "members" || value === "activity";
}

export default function ProjectDetailsPage() {
  const { notify } = useToast();
  const { user } = useAuth();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.projectId;
  const currentTab = isWorkspaceTab(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "board";

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
  const [projectAudit, setProjectAudit] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

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

  const projectStats = useMemo(
    () => ({
      taskCount: tasks.length,
      memberCount: members.length,
      openCount: tasks.filter((task) => task.status !== "DONE").length,
    }),
    [members.length, tasks],
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
      const details = getErrorDetails(err);
      setError(details.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadActivity = useCallback(async () => {
    if (!projectId) return;
    if (user?.role !== "ADMIN") {
      setProjectAudit([]);
      setActivityError(null);
      return;
    }

    setActivityLoading(true);
    setActivityError(null);

    try {
      const auditRes = await listAuditLogs({ page: 1, limit: 50 });
      setProjectAudit(auditRes.items.filter((item) => item.projectId === projectId).slice(0, 12));
    } catch (err) {
      const details = getErrorDetails(err);
      setActivityError(details.message);
    } finally {
      setActivityLoading(false);
    }
  }, [projectId, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (currentTab === "activity") {
      void loadActivity();
    }
  }, [currentTab, loadActivity]);

  useProjectRealtime(
    projectId,
    (event) => {
      setEvents((prev) => [{ type: event.type, timestamp: event.timestamp }, ...prev].slice(0, 12));
      void load();
    },
    (event) => {
      setEvents((prev) => [{ type: event.type, timestamp: event.timestamp }, ...prev].slice(0, 12));
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
      notify("success", "Member added");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      notify("success", "Member removed");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      notify("success", "Task created");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      notify("success", assigneeId ? "Task assigned" : "Task unassigned");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      notify("success", "Task deleted");
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      const nextOrder = targetColumn.length > 0 ? Math.max(...targetColumn.map((item) => item.order)) + 1 : 1;

      await updateProjectTask(projectId, task.id, task.version, {
        status: targetStatus,
        order: nextOrder,
      });
      await load();
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
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
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
    } finally {
      setTaskActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="stack">
        <div className="skeleton skeleton-lg" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="project-header">
        <div className="project-header-main">
          <div className="project-breadcrumbs">
            <Link href="/app/projects">Projects</Link>
            <span>/</span>
            <span>{project?.name ?? "Project"}</span>
          </div>
          <h1>{project?.name ?? "Project"}</h1>
          <p>{project?.description || "No description"}</p>
        </div>

        <div className="project-meta-grid">
          <div className="stat-card">
            <strong>{projectStats.taskCount}</strong>
            <p className="soft">Tasks</p>
          </div>
          <div className="stat-card">
            <strong>{projectStats.openCount}</strong>
            <p className="soft">Open work</p>
          </div>
          <div className="stat-card">
            <strong>{projectStats.memberCount}</strong>
            <p className="soft">Members</p>
          </div>
        </div>
      </header>

      <nav className="project-tabs" aria-label="Project sections">
        {workspaceTabs.map((tab) => {
          const active = currentTab === tab;
          const href = `/app/projects/${projectId}?tab=${tab}`;
          const label = tab === "board" ? "Board" : tab === "members" ? "Members" : "Activity";

          return (
            <Link key={tab} href={href} className={active ? "project-tab project-tab-active" : "project-tab"}>
              {label}
            </Link>
          );
        })}
      </nav>

      {error ? <p className="error-text">{error}</p> : null}

      {currentTab === "board" ? (
        <div className="stack">
          <section className="board-toolbar">
            <div>
              <h2>Board</h2>
              <p className="soft">Move tasks across workflow stages and keep assignment visible.</p>
            </div>
            <p className="meta">Project ID: {projectId || "n/a"}</p>
          </section>

          <section className="projects-layout board-layout">
            <aside className="item-card project-create-panel">
              <div className="stack stack-sm">
                <div>
                  <h2>Create task</h2>
                  <p className="soft">Add the next piece of work directly into the board.</p>
                </div>

                <form className="auth-form auth-form-compact" onSubmit={onCreateTask}>
                  <label>
                    Task title
                    <input data-testid="task-title-input" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} minLength={1} required />
                  </label>

                  <label>
                    Description
                    <input data-testid="task-description-input" value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)} />
                  </label>

                  <label>
                    Priority
                    <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)} style={{ minHeight: 42 }}>
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
              </div>
            </aside>

            <section className="stack">
              {tasks.length === 0 ? <div className="empty-state">No tasks yet. Create the first task to start the board.</div> : null}

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
                            const assignee = task.assigneeId ? membersById.get(task.assigneeId) : null;

                            return (
                              <li key={task.id} className="kanban-item">
                                <strong>{task.title}</strong>
                                <span className="meta">#{task.order} - {task.priority} - v{task.version}</span>
                                <span className="soft">{assignee ? `Assignee: ${assignee.user.name || assignee.user.email}` : "Unassigned"}</span>
                                <div className="kanban-actions">
                                  <button className="button-micro" type="button" disabled={busy || index === 0} onClick={() => void onMoveTaskWithinStatus(task, "up")}>Up</button>
                                  <button className="button-micro" type="button" disabled={busy || index === groupedTasks[status].length - 1} onClick={() => void onMoveTaskWithinStatus(task, "down")}>Down</button>
                                  <button className="button-micro" type="button" disabled={busy || status === "TODO"} onClick={() => void onMoveTaskToStatus(task, status === "DONE" ? "IN_PROGRESS" : "TODO")}>Left</button>
                                  <button className="button-micro" type="button" disabled={busy || status === "DONE"} onClick={() => void onMoveTaskToStatus(task, status === "TODO" ? "IN_PROGRESS" : "DONE")}>Right</button>
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

              <section className="item-card">
                <div className="panel-header panel-header-inline">
                  <h2>Task details</h2>
                  <span className="meta">Direct edits from workspace</span>
                </div>

                <ul className="list">
                  {tasks.map((task) => {
                    const busy = taskActionId === task.id;
                    const assignee = task.assigneeId ? membersById.get(task.assigneeId) : null;

                    return (
                      <li key={task.id} className="item-card" data-testid="task-item">
                        <div className="stack">
                          <strong>{task.title}</strong>
                          <span className="soft">{task.description || "No description"}</span>
                          <span className="meta">version {task.version} - order {task.order}</span>

                          <div className="columns-auto">
                            <label>
                              Status
                              <select value={task.status} onChange={(e) => void onChangeTaskStatus(task, e.target.value as TaskStatus)} disabled={busy} style={{ minHeight: 40 }}>
                                {taskStatuses.map((status) => (
                                  <option key={status} value={status}>{status}</option>
                                ))}
                              </select>
                            </label>

                            <label>
                              Priority
                              <select value={task.priority} onChange={(e) => void onChangeTaskPriority(task, e.target.value as TaskPriority)} disabled={busy} style={{ minHeight: 40 }}>
                                {taskPriorities.map((priority) => (
                                  <option key={priority} value={priority}>{priority}</option>
                                ))}
                              </select>
                            </label>

                            <label>
                              Assignee
                              <select value={task.assigneeId || ""} onChange={(e) => void onAssignTask(task, e.target.value)} disabled={busy} style={{ minHeight: 40 }}>
                                <option value="">Unassigned</option>
                                {members.map((member) => (
                                  <option key={member.userId} value={member.userId}>{member.user.name || member.user.email} ({member.role})</option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <span className="soft">Current assignee: {assignee ? assignee.user.name || assignee.user.email : "none"}</span>

                          <button data-testid={`task-delete-${task.id}`} className="button button-ghost" type="button" disabled={busy} onClick={() => void onDeleteTask(task)}>
                            {busy ? "Working..." : "Delete task"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </section>
          </section>
        </div>
      ) : null}

      {currentTab === "members" ? (
        <div className="stack">
          <section className="board-toolbar">
            <div>
              <h2>Members</h2>
              <p className="soft">Manage who can access this project and what role they have.</p>
            </div>
          </section>

          <section className="projects-layout">
            <aside className="item-card project-create-panel">
              <div className="stack stack-sm">
                <div>
                  <h2>Add member</h2>
                  <p className="soft">Invite a teammate with the right responsibility level.</p>
                </div>

                <form className="auth-form auth-form-compact" onSubmit={onAddMember}>
                  <label>
                    User ID
                    <input data-testid="member-user-id-input" placeholder="Paste user id" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} required />
                  </label>

                  <label>
                    Role
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as ProjectRole)} style={{ minHeight: 42 }}>
                      {roles.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </label>

                  <button className="button button-primary" type="submit" disabled={memberPending}>
                    {memberPending ? "Saving..." : "Add member"}
                  </button>
                </form>
              </div>
            </aside>

            <section className="stack">
              {members.length === 0 ? <div className="empty-state">No members in this project yet.</div> : null}

              <div className="projects-list-shell">
                <div className="projects-list-header">
                  <span>Member</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Actions</span>
                </div>

                <ul className="projects-rows">
                  {members.map((member) => (
                    <li key={member.userId} className="projects-row">
                      <div className="projects-row-main">
                        <strong>{member.user.name || member.user.email}</strong>
                        <span className="meta">{member.userId}</span>
                      </div>
                      <div className="projects-row-description">
                        <span className="soft">{member.user.email}</span>
                      </div>
                      <div className="projects-row-updated">
                        <span className="meta">{member.role}</span>
                      </div>
                      <div className="projects-row-actions">
                        <button className="button button-ghost button-compact" type="button" disabled={memberPending || member.role === "OWNER"} onClick={() => void onRemoveMember(member.userId)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </section>
        </div>
      ) : null}

      {currentTab === "activity" ? (
        <div className="stack">
          <section className="board-toolbar">
            <div>
              <h2>Activity</h2>
              <p className="soft">Follow recent realtime events and audit-backed history for this project.</p>
            </div>
          </section>

          <section className="overview-grid">
            <article className="item-card">
              <div className="panel-header panel-header-inline">
                <h2>Live events</h2>
                <span className="meta">{events.length} recent events</span>
              </div>
              {events.length === 0 ? (
                <div className="empty-state">No live events yet.</div>
              ) : (
                <ul className="list">
                  {events.map((event, index) => (
                    <li key={`${event.type}-${event.timestamp}-${index}`} className="workspace-row">
                      <strong>{event.type}</strong>
                      <span className="meta">{new Date(event.timestamp).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="item-card">
              <div className="panel-header panel-header-inline">
                <h2>Audit history</h2>
                <span className="meta">{user?.role === "ADMIN" ? "Admin access" : "Admin only"}</span>
              </div>

              {user?.role !== "ADMIN" ? (
                <div className="empty-state">Audit history is available to administrators. Live events remain visible for all members.</div>
              ) : null}

              {user?.role === "ADMIN" && activityLoading ? (
                <div className="stack">
                  <div className="skeleton skeleton-lg" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : null}

              {user?.role === "ADMIN" && activityError ? <p className="error-text">{activityError}</p> : null}

              {user?.role === "ADMIN" && !activityLoading && projectAudit.length === 0 ? (
                <div className="empty-state">No audit records found for this project yet.</div>
              ) : null}

              {user?.role === "ADMIN" && projectAudit.length > 0 ? (
                <ul className="list">
                  {projectAudit.map((log) => (
                    <li key={log.id} className="workspace-row">
                      <div>
                        <strong>{log.action}</strong>
                        <p className="meta">{log.entityType || "system"} - {log.entityId || "n/a"}</p>
                      </div>
                      <span className="meta">{new Date(log.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </section>
        </div>
      ) : null}
    </div>
  );
}



