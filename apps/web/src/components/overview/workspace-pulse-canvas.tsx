"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { API_ORIGIN } from "../../lib/env";
import type { AuditLog } from "../../lib/audit/api";
import type { Project } from "../../lib/projects/api";
import type { WorkspaceTask } from "../../lib/tasks/api";

type Cluster = {
  id: string;
  projectId: string | null;
  name: string;
  x: number;
  y: number;
  radius: number;
  tone: "moss" | "accent" | "ink";
  tasks: Array<{
    id: string;
    title: string;
    status: WorkspaceTask["status"];
    x: number;
    y: number;
    size: number;
  }>;
};

type LiveSignal = {
  id: string;
  action: string;
  projectId: string | null;
  timestamp: string;
  emphasis: "ambient" | "live";
};

type RealtimeEventPayload = {
  type: string;
  projectId: string;
  timestamp: string;
};

const VIEWBOX_WIDTH = 520;
const VIEWBOX_HEIGHT = 400;
const MAX_SIGNAL_FEED = 10;

const clusterLayout = [
  { x: 154, y: 154, radius: 66, tone: "moss" as const },
  { x: 392, y: 132, radius: 54, tone: "accent" as const },
  { x: 316, y: 286, radius: 60, tone: "ink" as const },
];
const fallbackClusterLayout = clusterLayout[clusterLayout.length - 1] ?? {
  x: 316,
  y: 286,
  radius: 60,
  tone: "ink" as const,
};

const seedClusters: Cluster[] = [
  {
    id: "seed-1",
    projectId: null,
    name: "Seed cluster",
    x: 164,
    y: 156,
    radius: 64,
    tone: "moss",
    tasks: [
      { id: "seed-1-a", title: "Plan", status: "TODO", x: 250, y: 132, size: 10 },
      { id: "seed-1-b", title: "Draft", status: "IN_PROGRESS", x: 222, y: 238, size: 9 },
      { id: "seed-1-c", title: "Review", status: "TESTING", x: 92, y: 212, size: 8 },
    ],
  },
  {
    id: "seed-2",
    projectId: null,
    name: "Activation",
    x: 392,
    y: 144,
    radius: 52,
    tone: "accent",
    tasks: [
      { id: "seed-2-a", title: "Invite", status: "TODO", x: 462, y: 138, size: 8 },
      { id: "seed-2-b", title: "Sync", status: "DONE", x: 428, y: 218, size: 7 },
    ],
  },
  {
    id: "seed-3",
    projectId: null,
    name: "Momentum",
    x: 336,
    y: 286,
    radius: 56,
    tone: "ink",
    tasks: [
      { id: "seed-3-a", title: "Ship", status: "DONE", x: 430, y: 308, size: 9 },
      { id: "seed-3-b", title: "Tune", status: "IN_PROGRESS", x: 286, y: 366, size: 8 },
      { id: "seed-3-c", title: "Trace", status: "TESTING", x: 256, y: 234, size: 7 },
    ],
  },
];

const constellation = [
  { x: 70, y: 70, r: 2 },
  { x: 124, y: 312, r: 1.8 },
  { x: 192, y: 42, r: 2.4 },
  { x: 258, y: 96, r: 1.6 },
  { x: 474, y: 74, r: 2.2 },
  { x: 458, y: 336, r: 1.7 },
  { x: 78, y: 224, r: 2.1 },
  { x: 254, y: 348, r: 2.2 },
];

function projectTone(index: number) {
  if (index === 0) return "moss" as const;
  if (index === 1) return "accent" as const;
  return "ink" as const;
}

function clampTitle(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function taskOpacity(status: WorkspaceTask["status"]) {
  if (status === "DONE") return 0.45;
  if (status === "TESTING") return 0.75;
  if (status === "IN_PROGRESS") return 0.92;
  return 0.62;
}

function actionLabel(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}

function toRealtimeEvent(value: unknown): RealtimeEventPayload | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<RealtimeEventPayload>;
  if (
    typeof candidate.type !== "string" ||
    typeof candidate.projectId !== "string" ||
    typeof candidate.timestamp !== "string"
  ) {
    return null;
  }

  return {
    type: candidate.type,
    projectId: candidate.projectId,
    timestamp: candidate.timestamp,
  };
}

function toAuditSignal(event: AuditLog): LiveSignal {
  return {
    id: event.id,
    action: event.action,
    projectId: event.projectId,
    timestamp: event.createdAt,
    emphasis: "ambient",
  };
}

function toLiveSignal(event: RealtimeEventPayload): LiveSignal {
  return {
    id: `${event.projectId}-${event.type}-${event.timestamp}`,
    action: event.type,
    projectId: event.projectId,
    timestamp: event.timestamp,
    emphasis: "live",
  };
}

export function WorkspacePulseCanvas({
  projects,
  tasks,
  recentAudit,
}: {
  projects: Project[];
  tasks: WorkspaceTask[];
  recentAudit: AuditLog[];
}) {
  const visibleProjects = useMemo(() => projects.slice(0, 3), [projects]);
  const visibleProjectIds = useMemo(
    () => visibleProjects.map((project) => project.id),
    [visibleProjects],
  );
  const baseSignals = useMemo(
    () => recentAudit.slice(0, MAX_SIGNAL_FEED).map(toAuditSignal),
    [recentAudit],
  );
  const [signalFeed, setSignalFeed] = useState<LiveSignal[]>(baseSignals);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);

  useEffect(() => {
    setSignalFeed(baseSignals);
  }, [baseSignals]);

  useEffect(() => {
    if (visibleProjectIds.length === 0) return;

    let active = true;
    let cleanup: (() => void) | undefined;

    const connect = async () => {
      const ioClient = await import("socket.io-client");
      if (!active) return;

      const socket = ioClient.io(`${API_ORIGIN}/realtime`, {
        transports: ["websocket"],
        withCredentials: true,
      });

      for (const projectId of visibleProjectIds) {
        socket.emit("project:join", { projectId });
      }

      const handleRealtimeEvent = (incoming: unknown) => {
        const event = toRealtimeEvent(incoming);
        if (!event || !visibleProjectIds.includes(event.projectId)) return;

        const nextSignal = toLiveSignal(event);
        setSignalFeed((current) => {
          const deduped = current.filter((signal) => signal.id !== nextSignal.id);
          return [nextSignal, ...deduped].slice(0, MAX_SIGNAL_FEED);
        });
      };

      socket.on("project:event", handleRealtimeEvent);
      socket.on("task:event", handleRealtimeEvent);

      cleanup = () => {
        for (const projectId of visibleProjectIds) {
          socket.emit("project:leave", { projectId });
        }
        socket.off("project:event", handleRealtimeEvent);
        socket.off("task:event", handleRealtimeEvent);
        socket.disconnect();
      };
    };

    void connect();

    return () => {
      active = false;
      cleanup?.();
    };
  }, [visibleProjectIds]);

  const clusters = useMemo(() => {
    if (visibleProjects.length === 0) {
      return seedClusters;
    }

    return visibleProjects.map((project, index) => {
      const layout = clusterLayout[index] ?? fallbackClusterLayout;
      const relatedTasks = tasks
        .filter((task) => task.project.id === project.id)
        .slice(0, 5);

      const satellites = relatedTasks.map((task, taskIndex) => {
        const angleOffset = index * 0.65;
        const angle = (Math.PI * 2 * taskIndex) / Math.max(relatedTasks.length, 1) + angleOffset;
        const orbit = layout.radius + 42 + taskIndex * 8;
        return {
          id: task.id,
          title: task.title,
          status: task.status,
          x: Math.round(layout.x + Math.cos(angle) * orbit),
          y: Math.round(layout.y + Math.sin(angle) * orbit),
          size: Math.max(7, 12 - taskIndex),
        };
      });

      return {
        id: `cluster-${project.id}`,
        projectId: project.id,
        name: project.name,
        x: layout.x,
        y: layout.y,
        radius: layout.radius,
        tone: projectTone(index),
        tasks: satellites,
      };
    });
  }, [tasks, visibleProjects]);

  const activeTasks = tasks.filter((task) => task.status !== "DONE").length;
  const completedTasks = tasks.filter((task) => task.status === "DONE").length;
  const displayedSignals = signalFeed.slice(0, 5);
  const signalBursts = displayedSignals.slice(0, 4);
  const hoveredCluster =
    clusters.find((cluster) => cluster.id === hoveredClusterId) ?? null;
  const hoveredProject =
    visibleProjects.find((project) => project.id === hoveredCluster?.projectId) ?? null;
  const hoveredTaskCount = tasks.filter(
    (task) => task.project.id === hoveredProject?.id,
  );
  const hoveredCompletedCount = hoveredTaskCount.filter(
    (task) => task.status === "DONE",
  ).length;
  const hoveredActiveCount = hoveredTaskCount.length - hoveredCompletedCount;
  const hoveredSignal = displayedSignals.find(
    (signal) => signal.projectId === hoveredProject?.id,
  );
  const tooltipSide =
    hoveredCluster && hoveredCluster.x > 340
      ? "left"
      : hoveredCluster && hoveredCluster.x < 180
        ? "right"
        : "center";

  return (
    <div className="workspace-pulse-shell">
      <div className="workspace-pulse-copy">
        <div>
          <h3>Workspace Pulse</h3>
          <p className="soft">
            A living map of projects, task momentum, and collaboration signals that keeps
            reacting as the workspace changes.
          </p>
        </div>
        <div className="workspace-pulse-stats">
          <span className="badge badge-ok">{visibleProjects.length} clusters</span>
          <span className="badge badge-neutral">{activeTasks} active tasks</span>
          <span className="badge badge-neutral">{displayedSignals.length} live signals</span>
        </div>
      </div>

      <div className="workspace-pulse-canvas">
        <div className="workspace-pulse-aurora workspace-pulse-aurora-moss" />
        <div className="workspace-pulse-aurora workspace-pulse-aurora-accent" />
        <div className="workspace-pulse-aurora workspace-pulse-aurora-ink" />

        <svg
          className="workspace-pulse-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label="Living workspace canvas"
        >
          <defs>
            <radialGradient id="pulseGlowMoss" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(154,199,115,0.42)" />
              <stop offset="100%" stopColor="rgba(154,199,115,0)" />
            </radialGradient>
            <radialGradient id="pulseGlowAccent" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(202,102,58,0.38)" />
              <stop offset="100%" stopColor="rgba(202,102,58,0)" />
            </radialGradient>
            <radialGradient id="pulseGlowInk" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(34,66,107,0.24)" />
              <stop offset="100%" stopColor="rgba(34,66,107,0)" />
            </radialGradient>
            <linearGradient id="pulseArc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(154,199,115,0.46)" />
              <stop offset="50%" stopColor="rgba(202,102,58,0.4)" />
              <stop offset="100%" stopColor="rgba(34,66,107,0.28)" />
            </linearGradient>
          </defs>

          <rect
            className="workspace-pulse-grid"
            x="0"
            y="0"
            width={VIEWBOX_WIDTH}
            height={VIEWBOX_HEIGHT}
            rx="26"
          />

          {constellation.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}`}
              className="workspace-pulse-star"
              cx={point.x}
              cy={point.y}
              r={point.r}
              style={{ animationDelay: `${index * 0.6}s` }}
            />
          ))}

          {clusters.map((cluster, index) => {
            const next = clusters[(index + 1) % clusters.length];
            if (!next || next.id === cluster.id) return null;

            const cx = (cluster.x + next.x) / 2;
            const cy = Math.min(cluster.y, next.y) - 42;

            return (
              <path
                key={`${cluster.id}-${next.id}`}
                className="workspace-pulse-link"
                d={`M ${cluster.x} ${cluster.y} Q ${cx} ${cy} ${next.x} ${next.y}`}
              />
            );
          })}

          {clusters.map((cluster, index) => (
            <g
              key={cluster.id}
              className={`workspace-pulse-cluster workspace-pulse-cluster-${cluster.tone}`}
              style={{ animationDelay: `${index * 0.9}s` }}
              onMouseEnter={() => setHoveredClusterId(cluster.id)}
              onMouseLeave={() => setHoveredClusterId((current) => (current === cluster.id ? null : current))}
            >
              <circle
                className="workspace-pulse-glow"
                cx={cluster.x}
                cy={cluster.y}
                r={cluster.radius + 48}
              />
              <circle
                className="workspace-pulse-orbit"
                cx={cluster.x}
                cy={cluster.y}
                r={cluster.radius + 24}
              />
              <circle
                className="workspace-pulse-core"
                cx={cluster.x}
                cy={cluster.y}
                r={cluster.radius}
              />
              <text
                className="workspace-pulse-label"
                x={cluster.x}
                y={cluster.y - 8}
                textAnchor="middle"
              >
                {clampTitle(cluster.name, 18)}
              </text>
              <text
                className="workspace-pulse-subtle"
                x={cluster.x}
                y={cluster.y + 16}
                textAnchor="middle"
              >
                {cluster.tasks.length} active nodes
              </text>

              {cluster.tasks.map((task, taskIndex) => (
                <g
                  key={task.id}
                  className="workspace-pulse-task"
                  style={{
                    opacity: taskOpacity(task.status),
                    animationDelay: `${index * 0.8 + taskIndex * 0.22}s`,
                  }}
                >
                  <line
                    className="workspace-pulse-task-link"
                    x1={cluster.x}
                    y1={cluster.y}
                    x2={task.x}
                    y2={task.y}
                  />
                  <circle
                    className="workspace-pulse-task-node"
                    cx={task.x}
                    cy={task.y}
                    r={task.size}
                  />
                </g>
              ))}
            </g>
          ))}

          {signalBursts.map((signal, index) => {
            const anchor =
              clusters.find((cluster) => cluster.projectId === signal.projectId) ??
              clusters[index % clusters.length];
            if (!anchor) return null;

            const offsetX = anchor.x + anchor.radius + 18 + index * 6;
            const offsetY = anchor.y - anchor.radius + 18 + index * 10;

            return (
              <g
                key={signal.id}
                className={`workspace-pulse-signal workspace-pulse-signal-${signal.emphasis}`}
                style={{ animationDelay: `${index * 0.8}s` }}
              >
                <circle cx={offsetX} cy={offsetY} r="5" />
                <circle className="workspace-pulse-signal-ring" cx={offsetX} cy={offsetY} r="14" />
              </g>
            );
          })}
        </svg>

        <div className="workspace-pulse-overlay workspace-pulse-overlay-top">
          <span className="workspace-pulse-caption">Live topology</span>
          <strong>{visibleProjects.length > 0 ? "Signal-linked workspace" : "Seeded launch state"}</strong>
          <p className="meta">
            {visibleProjects.length > 0
              ? "Project nuclei pulse while live events keep feeding the field."
              : "Create your first project and the seed clusters will become real project cores."}
          </p>
        </div>

        <div className="workspace-pulse-overlay workspace-pulse-overlay-bottom">
          <div className="workspace-pulse-metric">
            <span>Active</span>
            <strong>{activeTasks}</strong>
          </div>
          <div className="workspace-pulse-metric">
            <span>Completed</span>
            <strong>{completedTasks}</strong>
          </div>
          <div className="workspace-pulse-metric">
            <span>Signals</span>
            <strong>{displayedSignals.length}</strong>
          </div>
        </div>

        {hoveredCluster && hoveredProject ? (
          <div
            className={`workspace-pulse-tooltip workspace-pulse-tooltip-${tooltipSide}`}
            style={{
              left: `${(hoveredCluster.x / VIEWBOX_WIDTH) * 100}%`,
              top: `${(hoveredCluster.y / VIEWBOX_HEIGHT) * 100}%`,
            }}
          >
            <span className="workspace-pulse-caption">Project focus</span>
            <strong>{clampTitle(hoveredProject.name, 26)}</strong>
            <p className="meta">
              {hoveredProject.description
                ? clampTitle(hoveredProject.description, 76)
                : "Live project cluster with current task orbit and recent activity."}
            </p>
            <div className="workspace-pulse-tooltip-stats">
              <span>{hoveredActiveCount} active</span>
              <span>{hoveredCompletedCount} done</span>
              <span>{hoveredSignal ? actionLabel(hoveredSignal.action) : "steady pulse"}</span>
            </div>
            <Link href={`/app/projects/${hoveredProject.id}`} className="workspace-pulse-tooltip-link">
              Open project
            </Link>
          </div>
        ) : null}
      </div>

      {visibleProjects.length > 0 ? (
        <>
          <div className="workspace-pulse-project-strip">
            {visibleProjects.map((project, index) => {
              const clusterId = `cluster-${project.id}`;
              return (
                <Link
                  key={project.id}
                  href={`/app/projects/${project.id}`}
                  className={`workspace-pulse-project-chip workspace-pulse-project-chip-${projectTone(index)} ${
                    hoveredClusterId === clusterId ? "workspace-pulse-project-chip-active" : ""
                  }`}
                  onMouseEnter={() => setHoveredClusterId(clusterId)}
                  onMouseLeave={() =>
                    setHoveredClusterId((current) => (current === clusterId ? null : current))
                  }
                >
                  <span className="workspace-pulse-project-dot" />
                  <span>{clampTitle(project.name, 22)}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <div className="workspace-pulse-empty-cta">
          <Link className="button button-primary button-compact" href="/app/projects">
            Create first project
          </Link>
          <span className="meta">Seed the field and let the workspace come alive.</span>
        </div>
      )}
    </div>
  );
}
