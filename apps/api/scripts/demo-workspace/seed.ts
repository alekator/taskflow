import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient, type User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_MARKER = "[demo-seed]";
const DEMO_USER_AGENT = "demo-workspace-seed";
const DEFAULT_PASSWORD = "123456";

const STATUSES = ["TODO", "IN_PROGRESS", "TESTING", "DONE"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const BASE_USER_SEEDS = [
  { email: "admin@test.com", name: "Admin", role: "ADMIN" as const },
  { email: "manager.alpha@demo.local", name: "Manager Alpha", role: "MANAGER" as const },
  { email: "manager.beta@demo.local", name: "Manager Beta", role: "MANAGER" as const },
  { email: "manager.gamma@demo.local", name: "Manager Gamma", role: "MANAGER" as const },
  { email: "lia@demo.local", name: "Lia Moreno", role: "USER" as const },
  { email: "noah@demo.local", name: "Noah Hale", role: "USER" as const },
  { email: "ava@demo.local", name: "Ava Quinn", role: "USER" as const },
  { email: "milo@demo.local", name: "Milo Hart", role: "USER" as const },
  { email: "zara@demo.local", name: "Zara Cole", role: "USER" as const },
  { email: "leo@demo.local", name: "Leo Frost", role: "USER" as const },
  { email: "maya@demo.local", name: "Maya Reed", role: "USER" as const },
  { email: "owen@demo.local", name: "Owen Pierce", role: "USER" as const },
];

const HEAVY_ONLY_USER_SEEDS = [
  { email: "iris@demo.local", name: "Iris Vale", role: "USER" as const },
  { email: "ethan@demo.local", name: "Ethan Shore", role: "USER" as const },
  { email: "ruby@demo.local", name: "Ruby Lane", role: "USER" as const },
  { email: "felix@demo.local", name: "Felix Rowan", role: "USER" as const },
  { email: "nora@demo.local", name: "Nora Bloom", role: "USER" as const },
  { email: "kai@demo.local", name: "Kai Mercer", role: "USER" as const },
  { email: "manager.delta@demo.local", name: "Manager Delta", role: "MANAGER" as const },
  { email: "manager.sigma@demo.local", name: "Manager Sigma", role: "MANAGER" as const },
];

const PROJECT_NAMES = [
  "Aurora Board",
  "Northwind Ops",
  "Atlas Forge",
  "Signal Harbor",
  "Orbit Desk",
  "Canvas Loom",
  "Vector Spring",
  "Comet Nest",
  "Marble Queue",
  "Echo Frame",
  "Summit Rail",
  "Pilot Current",
  "Glass Harbor",
  "Nova Ledger",
  "Ember Stack",
  "Cinder Loop",
  "Drift Works",
  "Mint Relay",
  "Harbor Sync",
  "Pulse Station",
  "Prism Foundry",
  "Beacon Grid",
  "Altitude Loop",
  "Slate Dock",
  "Monarch Flow",
  "Kite Assembly",
  "Ion Works",
  "Falcon Reach",
  "Helix Bay",
  "Delta Atlas",
  "Vanta Path",
  "Signal Bloom",
  "Motive Port",
  "Frame Current",
  "Tidal Desk",
  "Quartz Link",
  "Summit Harbor",
  "Nimbus Grid",
  "Relay Field",
  "Lattice Core",
];

const DESCRIPTION_BITS = [
  "Cross-team planning lane",
  "Release orchestration stream",
  "Documentation and QA workspace",
  "Experiment board for delivery signals",
  "Execution cluster for product operations",
  "Launch readiness pipeline for client-facing work",
  "Ops and product alignment stream with aggressive throughput",
  "Demonstration-heavy collaboration space for premium workspace previews",
];

const TASK_OPENERS = ["Draft", "Validate", "Refine", "Audit", "Prepare", "Ship", "Map", "Sync", "Calibrate", "Polish"];
const TASK_SUBJECTS = [
  "handoff",
  "release notes",
  "user flow",
  "API edge case",
  "roadmap branch",
  "automation pass",
  "design review",
  "priority sweep",
  "launch script",
  "team checkpoint",
  "quality gate",
  "client handover",
];

type SeedProfile = "standard" | "heavy";

type ProfileConfig = {
  projectCount: number;
  extraUsers: typeof HEAVY_ONLY_USER_SEEDS;
  minMembers: number;
  memberSpread: number;
  minTasks: number;
  taskSpread: number;
  roadmapEvery: number;
  updateEvery: number;
  extraAuditBursts: number;
  roadmapComplexity: "standard" | "heavy";
};

const PROFILE_CONFIG: Record<SeedProfile, ProfileConfig> = {
  standard: {
    projectCount: 20,
    extraUsers: [],
    minMembers: 2,
    memberSpread: 4,
    minTasks: 5,
    taskSpread: 6,
    roadmapEvery: 3,
    updateEvery: 2,
    extraAuditBursts: 0,
    roadmapComplexity: "standard",
  },
  heavy: {
    projectCount: 42,
    extraUsers: HEAVY_ONLY_USER_SEEDS,
    minMembers: 4,
    memberSpread: 6,
    minTasks: 9,
    taskSpread: 8,
    roadmapEvery: 2,
    updateEvery: 1,
    extraAuditBursts: 2,
    roadmapComplexity: "heavy",
  },
};

let randomCursor = 17;
let previousAuditHash: string | null = null;

function getProfile(): SeedProfile {
  const raw = process.argv
    .slice(2)
    .find((value) => value.startsWith("--profile="))
    ?.split("=")[1];

  return raw === "heavy" ? "heavy" : "standard";
}

function nextRandom() {
  randomCursor = (randomCursor * 9301 + 49297) % 233280;
  return randomCursor / 233280;
}

function pick<T>(items: T[]) {
  const index = Math.floor(nextRandom() * items.length) % items.length;
  return items[index];
}

function pickMany<T>(items: T[], count: number) {
  const copy = [...items];
  const picked: T[] = [];

  while (copy.length > 0 && picked.length < count) {
    const index = Math.floor(nextRandom() * copy.length) % copy.length;
    picked.push(copy.splice(index, 1)[0]);
  }

  return picked;
}

function daysFromNow(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function buildRoadmapElements(
  taskId: string,
  taskTitle: string,
  complexity: "standard" | "heavy",
): Prisma.InputJsonArray {
  const elements: Prisma.InputJsonArray = [
    {
      id: `${taskId}-note`,
      type: "text",
      x: 120,
      y: 120,
      text: `Focus: ${taskTitle}`,
      fontSize: 18,
    },
    {
      id: `${taskId}-rect`,
      type: "rect",
      x: 72,
      y: 86,
      width: 180,
      height: 92,
      stroke: "#ca663a",
      strokeWidth: 3,
    },
    {
      id: `${taskId}-arrow`,
      type: "arrow",
      x: 96,
      y: 220,
      toX: 222,
      toY: 148,
      stroke: "#6f9b55",
      strokeWidth: 3,
    },
  ];

  if (complexity === "heavy") {
    return [
      ...elements,
      {
        id: `${taskId}-lane`,
        type: "rect",
        x: 286,
        y: 102,
        width: 140,
        height: 74,
        stroke: "#22426b",
        strokeWidth: 3,
      },
      {
        id: `${taskId}-bridge`,
        type: "arrow",
        x: 254,
        y: 132,
        toX: 286,
        toY: 132,
        stroke: "#22426b",
        strokeWidth: 3,
      },
      {
        id: `${taskId}-caption`,
        type: "text",
        x: 300,
        y: 214,
        text: "Review lane",
        fontSize: 16,
      },
    ];
  }

  return elements;
}

async function createAuditLog(input: {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  actorUserId?: string | null;
  payload?: unknown;
}) {
  const requestId = randomUUID();
  const hash = createHash("sha256")
    .update(
      `${previousAuditHash ?? "root"}:${input.action}:${input.entityType ?? "system"}:${input.entityId ?? "n/a"}:${requestId}`,
    )
    .digest("hex");

  await prisma.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      projectId: input.projectId ?? null,
      actorUserId: input.actorUserId ?? null,
      requestId,
      ip: "127.0.0.1",
      userAgent: DEMO_USER_AGENT,
      prevHash: previousAuditHash,
      hash,
      payload: input.payload ?? undefined,
    },
  });

  previousAuditHash = hash;
}

async function resetExistingDemoWorkspace() {
  await prisma.taskRoadmap.deleteMany({
    where: { task: { project: { description: { contains: DEMO_MARKER } } } },
  });
  await prisma.task.deleteMany({
    where: { project: { description: { contains: DEMO_MARKER } } },
  });
  await prisma.projectMember.deleteMany({
    where: { project: { description: { contains: DEMO_MARKER } } },
  });
  await prisma.project.deleteMany({
    where: { description: { contains: DEMO_MARKER } },
  });
  await prisma.auditLog.deleteMany({
    where: { userAgent: DEMO_USER_AGENT },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: "@demo.local" } },
  });
}

async function ensureUsers(profile: SeedProfile) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const seeds = [...BASE_USER_SEEDS, ...PROFILE_CONFIG[profile].extraUsers];

  const users: User[] = [];
  for (const seed of seeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {
        name: seed.name,
        role: seed.role,
      },
      create: {
        email: seed.email,
        passwordHash,
        name: seed.name,
        role: seed.role,
      },
    });
    users.push(user);
  }

  return users;
}

async function main() {
  const profile = getProfile();
  const config = PROFILE_CONFIG[profile];

  await resetExistingDemoWorkspace();
  const users = await ensureUsers(profile);

  const admin = users.find((user) => user.email === "admin@test.com");
  if (!admin) throw new Error("Admin user is required for demo seeding");

  const assignableUsers = users.filter((user) => user.email !== "admin@test.com");

  let projectCount = 0;
  let taskCount = 0;
  let roadmapCount = 0;

  for (let index = 0; index < config.projectCount; index += 1) {
    const owner = index % 4 === 0 ? admin : pick(assignableUsers);
    const project = await prisma.project.create({
      data: {
        name: `${PROJECT_NAMES[index % PROJECT_NAMES.length]} ${String(index + 1).padStart(2, "0")}`,
        description: `${pick(DESCRIPTION_BITS)} ${DEMO_MARKER} ${profile === "heavy" ? "[heavy-demo]" : ""}`.trim(),
        ownerId: owner.id,
      },
    });
    projectCount += 1;

    await createAuditLog({
      action: "PROJECT_CREATE",
      entityType: "project",
      entityId: project.id,
      projectId: project.id,
      actorUserId: owner.id,
      payload: { profile, projectName: project.name },
    });

    if (owner.id !== admin.id) {
      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: admin.id,
          role: "MANAGER",
        },
      });

      await createAuditLog({
        action: "PROJECT_MEMBER_ADD",
        entityType: "project_member",
        entityId: `${project.id}:${admin.id}`,
        projectId: project.id,
        actorUserId: owner.id,
        payload: { role: "MANAGER", userId: admin.id, systemAccess: true },
      });
    }

    const memberPool = assignableUsers.filter((user) => user.id !== owner.id);
    const memberCount = config.minMembers + (index % config.memberSpread);
    const members = pickMany(memberPool, memberCount);

    for (const member of members) {
      const role = member.role === "MANAGER" ? "MANAGER" : "MEMBER";

      await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: member.id,
          role,
        },
      });

      await createAuditLog({
        action: "PROJECT_MEMBER_ADD",
        entityType: "project_member",
        entityId: `${project.id}:${member.id}`,
        projectId: project.id,
        actorUserId: owner.id,
        payload: { role, userId: member.id },
      });
    }

    const participants = [owner, ...members];
    const totalTasks = config.minTasks + (index % config.taskSpread);

    for (let taskIndex = 0; taskIndex < totalTasks; taskIndex += 1) {
      const status = STATUSES[(index + taskIndex) % STATUSES.length];
      const priority = PRIORITIES[(index * 2 + taskIndex) % PRIORITIES.length];
      const assignee = pick(participants);

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: `${pick(TASK_OPENERS)} ${pick(TASK_SUBJECTS)} ${taskIndex + 1}`,
          description: `Seeded task for visual workflow review in ${project.name}. ${DEMO_MARKER}`,
          status,
          priority,
          order: taskIndex,
          assigneeId: assignee.id,
          dueDate:
            status === "DONE"
              ? daysFromNow(-(taskIndex % 6))
              : daysFromNow((taskIndex % 12) + 1),
        },
      });
      taskCount += 1;

      await createAuditLog({
        action: "TASK_CREATE",
        entityType: "task",
        entityId: task.id,
        projectId: project.id,
        actorUserId: assignee.id,
        payload: { status, priority },
      });

      if (taskIndex % config.updateEvery === 0) {
        await createAuditLog({
          action: "TASK_UPDATE",
          entityType: "task",
          entityId: task.id,
          projectId: project.id,
          actorUserId: pick(participants).id,
          payload: { status, priority, touch: "demo-refresh" },
        });
      }

      if ((index + taskIndex) % config.roadmapEvery === 0) {
        await prisma.taskRoadmap.create({
          data: {
            taskId: task.id,
            data: {
              version: 1,
              taskId: task.id,
              viewport: { x: 0, y: 0, zoom: 1 },
              elements: buildRoadmapElements(task.id, task.title, config.roadmapComplexity),
            },
          },
        });
        roadmapCount += 1;

        await createAuditLog({
          action: "TASK_ROADMAP_UPDATE",
          entityType: "task",
          entityId: task.id,
          projectId: project.id,
          actorUserId: pick(participants).id,
          payload: { source: "demo-seed", profile },
        });
      }

      for (let burstIndex = 0; burstIndex < config.extraAuditBursts; burstIndex += 1) {
        const burstAction =
          burstIndex % 2 === 0 ? "TASK_ASSIGNMENT_SYNC" : "TASK_STATUS_REVIEW";

        await createAuditLog({
          action: burstAction,
          entityType: "task",
          entityId: task.id,
          projectId: project.id,
          actorUserId: pick(participants).id,
          payload: { profile, burstIndex, status, priority },
        });
      }
    }
  }

  console.log(
    `Demo workflow (${profile}) seeded: ${projectCount} projects, ${taskCount} tasks, ${roadmapCount} roadmaps.`,
  );
  console.log(`Demo users use password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
