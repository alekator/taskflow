"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  createProjectTask,
  listProjectTasks,
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
const taskStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "TESTING", "DONE"];
const taskPriorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  TESTING: "Testing",
  DONE: "Done",
};
const workspaceTabs = ["board", "members", "activity"] as const;
type WorkspaceTab = (typeof workspaceTabs)[number];

type RealtimeEvent = {
  type: string;
  timestamp: string;
};

type DragState = {
  taskId: string;
  fromStatus: TaskStatus;
} | null;

type DropIndicator = {
  status: TaskStatus;
  index: number;
} | null;

type TaskCardPointerState = {
  taskId: string;
  x: number;
  y: number;
} | null;

type MoveProjection = {
  nextTasks: Task[];
  updates: Array<{
    taskId: string;
    version: number;
    status: TaskStatus;
    order: number;
  }>;
};

function getTaskStatusLabel(status: TaskStatus) {
  return taskStatusLabels[status];
}

function getMemberLabel(member: ProjectMember | null | undefined) {
  if (!member) return "Unassigned";
  return member.user.name || member.user.email;
}

function getMemberInitial(member: ProjectMember | null | undefined) {
  return getMemberLabel(member).slice(0, 1).toUpperCase();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

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

function projectTaskMove(
  tasks: Task[],
  groupedTasks: Record<TaskStatus, Task[]>,
  dragState: NonNullable<DragState>,
  targetStatus: TaskStatus,
  targetIndex: number,
): MoveProjection | null {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const sourceTask = taskMap.get(dragState.taskId);

  if (!sourceTask) return null;

  const sourceColumn = groupedTasks[sourceTask.status].slice();
  const sourceWithoutTask = sourceColumn.filter((task) => task.id !== sourceTask.id);
  const targetBase =
    sourceTask.status === targetStatus ? sourceWithoutTask : groupedTasks[targetStatus].slice();
  const insertIndex = Math.max(0, Math.min(targetIndex, targetBase.length));

  const targetWithTask = [
    ...targetBase.slice(0, insertIndex),
    { ...sourceTask, status: targetStatus },
    ...targetBase.slice(insertIndex),
  ];

  const normalizedTarget = targetWithTask.map((task, index) => ({
    ...task,
    status: targetStatus,
    order: index + 1,
  }));

  const normalizedSource =
    sourceTask.status === targetStatus
      ? []
      : sourceWithoutTask.map((task, index) => ({
          ...task,
          status: sourceTask.status,
          order: index + 1,
        }));

  const updates = [...normalizedTarget, ...normalizedSource].filter((task) => {
    const original = taskMap.get(task.id);
    return original && (original.status !== task.status || original.order !== task.order);
  });

  if (updates.length === 0) return null;

  const nextMap = new Map(tasks.map((task) => [task.id, task]));
  for (const task of updates) {
    nextMap.set(task.id, task);
  }

  return {
    nextTasks: tasks.map((task) => nextMap.get(task.id) ?? task),
    updates: updates.map((task) => ({
      taskId: task.id,
      version: taskMap.get(task.id)?.version ?? task.version,
      status: task.status,
      order: task.order,
    })),
  };
}

export default function ProjectDetailsPage() {
  const { notify } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const projectId = params.projectId;
  const currentTabParam = searchParams.get("tab");

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
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [taskCreatePending, setTaskCreatePending] = useState(false);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<"ALL" | TaskPriority>("ALL");
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<"ALL" | string>("ALL");
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
  const [taskCardPointerState, setTaskCardPointerState] =
    useState<TaskCardPointerState>(null);
  const [didDragTaskCard, setDidDragTaskCard] = useState(false);

  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [projectAudit, setProjectAudit] = useState<AuditLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        taskSearch.trim().length === 0 ||
        task.title.toLowerCase().includes(taskSearch.trim().toLowerCase()) ||
        (task.description ?? "").toLowerCase().includes(taskSearch.trim().toLowerCase());
      const matchesStatus =
        taskStatusFilter === "ALL" || task.status === taskStatusFilter;
      const matchesPriority =
        taskPriorityFilter === "ALL" || task.priority === taskPriorityFilter;
      const matchesAssignee =
        taskAssigneeFilter === "ALL" || task.assigneeId === taskAssigneeFilter;

      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    });
  }, [taskAssigneeFilter, taskPriorityFilter, taskSearch, taskStatusFilter, tasks]);

  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      TESTING: [],
      DONE: [],
    };

    for (const task of filteredTasks) {
      groups[task.status].push(task);
    }

    for (const status of taskStatuses) {
      groups[status].sort((a, b) => a.order - b.order);
    }

    return groups;
  }, [filteredTasks]);

  const projectStats = useMemo(
    () => ({
      taskCount: tasks.length,
      memberCount: members.length,
      openCount: tasks.filter((task) => task.status !== "DONE").length,
    }),
    [members.length, tasks],
  );

  const taskStatusCounts = useMemo(
    () => ({
      TODO: tasks.filter((task) => task.status === "TODO").length,
      IN_PROGRESS: tasks.filter((task) => task.status === "IN_PROGRESS").length,
      TESTING: tasks.filter((task) => task.status === "TESTING").length,
      DONE: tasks.filter((task) => task.status === "DONE").length,
    }),
    [tasks],
  );

  const taskPriorityCounts = useMemo(
    () => ({
      LOW: tasks.filter((task) => task.priority === "LOW").length,
      MEDIUM: tasks.filter((task) => task.priority === "MEDIUM").length,
      HIGH: tasks.filter((task) => task.priority === "HIGH").length,
      URGENT: tasks.filter((task) => task.priority === "URGENT").length,
    }),
    [tasks],
  );

  const memberPreview = useMemo(
    () => members.slice(0, 3).map((member) => getMemberLabel(member)),
    [members],
  );

  const memberRoleStats = useMemo(
    () => ({
      owners: members.filter((member) => member.role === "OWNER").length,
      managers: members.filter((member) => member.role === "MANAGER").length,
      members: members.filter((member) => member.role === "MEMBER").length,
    }),
    [members],
  );

  const currentProjectRole = useMemo<ProjectRole | null>(() => {
    if (!user || !project) return null;
    if (project.ownerId === user.id) return "OWNER";
    return members.find((member) => member.userId === user.id)?.role ?? null;
  }, [members, project, user]);

  const canViewActivity =
    user?.role === "ADMIN" || currentProjectRole === "MANAGER";
  const availableTabs: WorkspaceTab[] = canViewActivity ? [...workspaceTabs] : ["board", "members"];
  const currentTab: WorkspaceTab =
    currentTabParam === "members"
      ? "members"
      : currentTabParam === "activity" && canViewActivity
        ? "activity"
        : "board";

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
    if (!canViewActivity) {
      setProjectAudit([]);
      setActivityError(null);
      return;
    }

    setActivityLoading(true);
    setActivityError(null);

    try {
      const auditRes = await listAuditLogs({ page: 1, limit: 50, projectId });
      setProjectAudit(auditRes.items.slice(0, 12));
    } catch (err) {
      const details = getErrorDetails(err);
      setActivityError(details.message);
    } finally {
      setActivityLoading(false);
    }
  }, [canViewActivity, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (currentTab === "activity") {
      void loadActivity();
    }
  }, [currentTab, loadActivity]);

  useEffect(() => {
    if (currentTabParam === "activity" && !canViewActivity && projectId) {
      router.replace(`/app/projects/${projectId}?tab=board`);
    }
  }, [canViewActivity, currentTabParam, projectId, router]);

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

  const clearDragState = () => {
    setDragState(null);
    setDropIndicator(null);
  };

  const openCreateTaskModal = () => {
    const defaultAssigneeId =
      currentProjectRole === "MEMBER" && user ? user.id : "";
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskPriority("MEDIUM");
    setNewTaskAssigneeId(defaultAssigneeId);
    setIsCreateTaskOpen(true);
  };

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
        assigneeId:
          currentProjectRole === "MEMBER"
            ? undefined
            : newTaskAssigneeId || undefined,
      });

      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("MEDIUM");
      setNewTaskAssigneeId("");
      setIsCreateTaskOpen(false);
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

  const onDragStartTask = (event: React.DragEvent<HTMLElement>, task: Task) => {
    setDidDragTaskCard(true);
    setDragState({ taskId: task.id, fromStatus: task.status });
    setDropIndicator({
      status: task.status,
      index: groupedTasks[task.status].findIndex((item) => item.id === task.id),
    });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  };

  const onTaskCardMouseDown = (
    event: React.MouseEvent<HTMLElement>,
    taskId: string,
  ) => {
    if (event.button !== 0) return;
    setTaskCardPointerState({ taskId, x: event.clientX, y: event.clientY });
    setDidDragTaskCard(false);
  };

  const onTaskCardMouseUp = (
    event: React.MouseEvent<HTMLElement>,
    task: Task,
  ) => {
    if (!taskCardPointerState || taskCardPointerState.taskId !== task.id) {
      return;
    }

    const dx = Math.abs(event.clientX - taskCardPointerState.x);
    const dy = Math.abs(event.clientY - taskCardPointerState.y);
    const moved = dx > 6 || dy > 6;

    setTaskCardPointerState(null);

    if (didDragTaskCard || moved) {
      setDidDragTaskCard(false);
      return;
    }

    router.push(`/app/tasks/${task.id}`);
  };

  const onDragOverZone = (
    event: React.DragEvent<HTMLElement>,
    status: TaskStatus,
    index: number,
  ) => {
    if (!dragState) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (!dropIndicator || dropIndicator.status !== status || dropIndicator.index !== index) {
      setDropIndicator({ status, index });
    }
  };

  const onDropTask = async (status: TaskStatus, index: number) => {
    if (!projectId || !dragState) return;

    const activeDrag = dragState;
    const projection = projectTaskMove(tasks, groupedTasks, activeDrag, status, index);
    clearDragState();

    if (!projection) return;

    const previousTasks = tasks;
    setTasks(projection.nextTasks);
    setTaskActionId(activeDrag.taskId);
    setError(null);

    try {
      await Promise.all(
        projection.updates.map((update) =>
          updateProjectTask(projectId, update.taskId, update.version, {
            status: update.status,
            order: update.order,
          }),
        ),
      );
      await load();
      notify("success", `Task moved to ${getTaskStatusLabel(status)}`);
    } catch (err) {
      setTasks(previousTasks);
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
    <div className="stack workspace-stack-tight">
      <header className="project-header">
        <div className="project-header-main">
          <div className="project-breadcrumbs">
            <Link href="/app/projects">Projects</Link>
            <span>/</span>
            <span>{project?.name ?? "Project"}</span>
          </div>
          <h1>{project?.name ?? "Project"}</h1>
          <p className="project-description-preview">{project?.description || "No description"}</p>
        </div>

        <div className="project-meta-grid">
          <div className="stat-card stat-card-compact">
            <div className="stat-card-head">
              <strong>{projectStats.taskCount}</strong>
              <p className="soft">Tasks</p>
            </div>
            <div className="stat-card-details">
              <span className={`badge ${getPriorityBadgeClass("LOW")}`}>LOW {taskPriorityCounts.LOW}</span>
              <span className={`badge ${getPriorityBadgeClass("MEDIUM")}`}>MEDIUM {taskPriorityCounts.MEDIUM}</span>
              <span className={`badge ${getPriorityBadgeClass("HIGH")}`}>HIGH {taskPriorityCounts.HIGH}</span>
              <span className={`badge ${getPriorityBadgeClass("URGENT")}`}>URGENT {taskPriorityCounts.URGENT}</span>
            </div>
          </div>
          <div className="stat-card stat-card-compact">
            <div className="stat-card-head">
              <strong>{projectStats.openCount}</strong>
              <p className="soft">Open work</p>
            </div>
            <div className="stat-card-details stat-card-details-strong">
              <span>{taskStatusCounts.TODO} waiting</span>
              <span>{taskStatusCounts.IN_PROGRESS} in progress</span>
              <span>{taskStatusCounts.TESTING} in review</span>
            </div>
          </div>
          <div className="stat-card stat-card-compact">
            <div className="stat-card-head">
              <strong>{projectStats.memberCount}</strong>
              <p className="soft">Members</p>
            </div>
            <div className="stat-card-details">
              {memberPreview.length > 0 ? memberPreview.map((item) => <span key={item}>{item}</span>) : <span>No members yet</span>}
              {members.length > memberPreview.length ? <span>+{members.length - memberPreview.length} more</span> : null}
            </div>
          </div>
          <button
            className="button button-primary project-create-trigger"
            type="button"
            data-testid="task-create-open"
            onClick={openCreateTaskModal}
          >
            Create task
          </button>
        </div>
      </header>

      <nav className="project-tabs" aria-label="Project sections">
        {availableTabs.map((tab) => {
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
        <div className="stack workspace-stack-tight">
          <section className="board-toolbar board-toolbar-compact">
            <div>
              <h2>Board</h2>
              <p className="soft">Keep the active workflow in one place and move work between Todo, In progress, Testing, and Done.</p>
            </div>
            <div className="board-toolbar-meta">
              <span className="badge badge-neutral">{filteredTasks.length} visible</span>
              <span className="meta">Project ID {projectId || "n/a"}</span>
            </div>
          </section>

          <section className="item-card board-filters-card board-filters-toolbar board-filters-toolbar-thin">
            <div className="board-filters-inline">
              <strong>Filters</strong>
              <label className="board-filter-search board-filter-inline-label">
                <span>Search</span>
                <input
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search by task title or description"
                />
              </label>

              <label className="board-filter-inline-label">
                <span>Status</span>
                <select value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value as "ALL" | TaskStatus)}>
                  <option value="ALL">All statuses</option>
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {getTaskStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="board-filter-inline-label">
                <span>Priority</span>
                <select value={taskPriorityFilter} onChange={(e) => setTaskPriorityFilter(e.target.value as "ALL" | TaskPriority)}>
                  <option value="ALL">All priorities</option>
                  {taskPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label className="board-filter-inline-label">
                <span>Assignee</span>
                <select value={taskAssigneeFilter} onChange={(e) => setTaskAssigneeFilter(e.target.value)}>
                  <option value="ALL">All assignees</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {getMemberLabel(member)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="button button-ghost button-compact"
                type="button"
                onClick={() => {
                  setTaskSearch("");
                  setTaskStatusFilter("ALL");
                  setTaskPriorityFilter("ALL");
                  setTaskAssigneeFilter("ALL");
                }}
              >
                Reset
              </button>
            </div>
          </section>

          {tasks.length === 0 ? <div className="empty-state">No tasks yet. Create the first task to start the board.</div> : null}
          {tasks.length > 0 && filteredTasks.length === 0 ? <div className="empty-state">No tasks match current filters.</div> : null}

          {filteredTasks.length > 0 ? (
            <section className="kanban-shell kanban-shell-expanded">
                {filteredTasks.length > 0 ? (
                  <section className="kanban kanban-four kanban-board-dense" data-testid="kanban-board">
                    {taskStatuses.map((status) => (
                      <article
                        key={status}
                        className={`kanban-column kanban-column-dense${dragState ? " kanban-column-droppable" : ""}`}
                        data-testid={`kanban-column-${status.toLowerCase()}`}
                        onDragOver={(event) => onDragOverZone(event, status, groupedTasks[status].length)}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void onDropTask(status, groupedTasks[status].length);
                        }}
                      >
                        <div className="kanban-column-header">
                          <div>
                            <h3>{getTaskStatusLabel(status)}</h3>
                            <p className="meta">{groupedTasks[status].length} tasks</p>
                          </div>
                          <span className="badge badge-neutral">{status.replace("_", " ")}</span>
                        </div>

                        {groupedTasks[status].length === 0 ? (
                          <div
                            className={`kanban-empty-drop${dropIndicator?.status === status && dropIndicator?.index === 0 ? " kanban-empty-drop-active" : ""}`}
                            onDragOver={(event) => onDragOverZone(event, status, 0)}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void onDropTask(status, 0);
                            }}
                          >
                            <p className="meta">Drop a task here</p>
                          </div>
                        ) : (
                          <ul className="kanban-list">
                            {groupedTasks[status].map((task, index) => {
                              const assignee = task.assigneeId ? membersById.get(task.assigneeId) : null;
                              const busy = taskActionId === task.id;

                              return (
                                <li key={task.id} className="kanban-lane-item">
                                  <div
                                    className={`kanban-dropzone${dropIndicator?.status === status && dropIndicator?.index === index ? " kanban-dropzone-active" : ""}`}
                                    onDragOver={(event) => onDragOverZone(event, status, index)}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void onDropTask(status, index);
                                    }}
                                  />

                                  <article
                                    className="kanban-item kanban-item-dense"
                                    draggable={!busy}
                                    onMouseDown={(event) =>
                                      onTaskCardMouseDown(event, task.id)
                                    }
                                    onMouseUp={(event) =>
                                      onTaskCardMouseUp(event, task)
                                    }
                                    onDragStart={(event) => onDragStartTask(event, task)}
                                    onDragEnd={() => {
                                      clearDragState();
                                      setTaskCardPointerState(null);
                                    }}
                                    data-testid={`task-card-${task.id}`}
                                  >
                                    <div className="kanban-item-trigger">
                                      <div className="kanban-item-topline">
                                        <span className={`badge ${getPriorityBadgeClass(task.priority)}`}>{task.priority}</span>
                                        <span className="badge badge-neutral">v{task.version}</span>
                                      </div>
                                      <strong>{task.title}</strong>
                                      <p className="kanban-item-description">{task.description || "Short description not added."}</p>
                                      <div className="kanban-item-footer">
                                        <span className="member-pill">
                                          <span className="member-pill-avatar">{getMemberInitial(assignee)}</span>
                                          <span>{getMemberLabel(assignee)}</span>
                                        </span>
                                      </div>
                                      <div className="kanban-item-meta-row">
                                        <span className="meta">#{task.order}</span>
                                        <span className="meta">Updated {formatDateTime(task.updatedAt)}</span>
                                      </div>
                                      <div className="kanban-item-hint">Drag between columns</div>
                                    </div>
                                  </article>
                                </li>
                              );
                            })}
                            <li>
                              <div
                                className={`kanban-dropzone${dropIndicator?.status === status && dropIndicator?.index === groupedTasks[status].length ? " kanban-dropzone-active" : ""}`}
                                onDragOver={(event) => onDragOverZone(event, status, groupedTasks[status].length)}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void onDropTask(status, groupedTasks[status].length);
                                }}
                              />
                            </li>
                          </ul>
                        )}
                      </article>
                    ))}
                  </section>
                ) : null}
            </section>
          ) : null}

          {isCreateTaskOpen ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={() => {
                if (!taskCreatePending) {
                  setIsCreateTaskOpen(false);
                }
              }}
            >
              <div
                className="modal-card task-create-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="task-create-modal-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="panel-header panel-header-inline">
                  <div>
                    <h2 id="task-create-modal-title">Create task</h2>
                    <p className="soft">
                      Add the next task with description, priority, and assignee in one place.
                    </p>
                  </div>
                  <button
                    className="button button-ghost button-compact"
                    type="button"
                    onClick={() => setIsCreateTaskOpen(false)}
                    disabled={taskCreatePending}
                  >
                    Close
                  </button>
                </div>

                <form className="auth-form auth-form-compact task-create-modal-form" onSubmit={onCreateTask}>
                  <div className="task-create-modal-grid">
                    <label>
                      Task title
                      <input
                        data-testid="task-title-input"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        minLength={1}
                        maxLength={80}
                        required
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

                    <label>
                      Assignee
                      <select
                        value={currentProjectRole === "MEMBER" && user ? user.id : newTaskAssigneeId}
                        onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                        disabled={currentProjectRole === "MEMBER"}
                        style={{ minHeight: 42 }}
                      >
                        {currentProjectRole !== "MEMBER" ? (
                          <option value="">Unassigned</option>
                        ) : null}
                        {members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {getMemberLabel(member)} ({member.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    Description <span className="meta">(optional)</span>
                      <textarea
                        data-testid="task-description-input"
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                        placeholder="Describe the task, expected result, and important context"
                        maxLength={300}
                        rows={8}
                      />
                  </label>

                  <div className="task-create-modal-actions">
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => setIsCreateTaskOpen(false)}
                      disabled={taskCreatePending}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button-primary"
                      type="submit"
                      data-testid="task-create-submit"
                      disabled={taskCreatePending}
                    >
                      {taskCreatePending ? "Creating..." : "Create task"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {currentTab === "members" ? (
        <div className="stack workspace-stack-tight">
          <section className="board-toolbar board-toolbar-compact">
            <div>
              <h2>Members</h2>
              <p className="soft">Manage who can access this project and what role they have.</p>
            </div>
          </section>

          <section className="columns-3">
            <article className="stat-card stat-card-compact">
              <strong>{memberRoleStats.owners}</strong>
              <p className="soft">Owners</p>
            </article>
            <article className="stat-card stat-card-compact">
              <strong>{memberRoleStats.managers}</strong>
              <p className="soft">Managers</p>
            </article>
            <article className="stat-card stat-card-compact">
              <strong>{memberRoleStats.members}</strong>
              <p className="soft">Members</p>
            </article>
          </section>

          <section className="projects-layout members-layout">
            <aside className="item-card project-create-panel members-create-panel">
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
                        <div className="member-cell">
                          <div className="member-avatar">{getMemberInitial(member)}</div>
                          <div className="member-identity">
                            <strong>{getMemberLabel(member)}</strong>
                            <span className="meta">{member.userId}</span>
                          </div>
                        </div>
                      </div>
                      <div className="projects-row-description">
                        <span className="soft">{member.user.email}</span>
                      </div>
                      <div className="projects-row-updated">
                        <span className={`badge ${member.role === "OWNER" ? "badge-ok" : "badge-neutral"}`}>
                          {member.role}
                        </span>
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
        <div className="stack workspace-stack-tight">
          <section className="board-toolbar board-toolbar-compact">
            <div>
              <h2>Activity</h2>
              <p className="soft">Follow the live project feed alongside audit-backed history for this project.</p>
            </div>
          </section>

          <section className="columns-3">
            <article className="stat-card stat-card-compact">
              <strong>{events.length}</strong>
              <p className="soft">Realtime feed</p>
            </article>
            <article className="stat-card stat-card-compact">
              <strong>{projectAudit.length}</strong>
              <p className="soft">Audit entries</p>
            </article>
            <article className="stat-card stat-card-compact">
              <strong>{canViewActivity ? "Project scope" : "Limited"}</strong>
              <p className="soft">Visibility level</p>
            </article>
          </section>

          <section className="overview-grid activity-grid-tight">
            <article className="item-card activity-card-tall">
              <div className="panel-header panel-header-inline">
                <div>
                  <h2>Realtime feed</h2>
                  <p className="meta">WebSocket updates appear here while teammates work in the project.</p>
                </div>
                <span className="meta">{events.length} recent events</span>
              </div>
              {events.length === 0 ? (
                <div className="empty-state empty-state-fill">No realtime updates yet. This panel fills as project events arrive live.</div>
              ) : (
                <ul className="activity-feed activity-feed-timeline">
                  {events.map((event, index) => (
                    <li key={`${event.type}-${event.timestamp}-${index}`} className="activity-item">
                      <div className="activity-dot" />
                      <div className="activity-copy">
                        <strong>{event.type}</strong>
                        <p className="meta">{new Date(event.timestamp).toLocaleString()}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="item-card activity-card-tall">
              <div className="panel-header panel-header-inline">
                <h2>Audit history</h2>
                <span className="meta">{canViewActivity ? "Scoped access" : "Admin only"}</span>
              </div>

              {!canViewActivity ? (
                <div className="empty-state empty-state-fill">Audit history is limited to administrators. The realtime feed remains visible to all project members.</div>
              ) : null}

              {canViewActivity && activityLoading ? (
                <div className="stack">
                  <div className="skeleton skeleton-lg" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : null}

              {canViewActivity && activityError ? <p className="error-text">{activityError}</p> : null}

              {canViewActivity && !activityLoading && projectAudit.length === 0 ? (
                <div className="empty-state empty-state-fill">No audit records found for this project yet.</div>
              ) : null}

              {canViewActivity && projectAudit.length > 0 ? (
                <ul className="activity-feed activity-feed-timeline">
                  {projectAudit.map((log) => (
                    <li key={log.id} className="activity-item">
                      <div className="activity-dot activity-dot-muted" />
                      <div className="activity-copy">
                        <strong>{log.action}</strong>
                        <p className="meta">
                          {log.entityType || "system"} - {log.entityId || "n/a"} - request {log.requestId || "n/a"}
                        </p>
                        <p className="meta">{new Date(log.createdAt).toLocaleString()}</p>
                      </div>
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



