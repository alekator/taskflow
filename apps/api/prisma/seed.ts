import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'main' },
    update: {},
    create: {
      id: 'ws_main',
      slug: 'main',
      name: 'TaskFlow Main Workspace',
    },
  });

  const passwordHash = await bcrypt.hash('123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {
      defaultWorkspaceId: workspace.id,
    },
    create: {
      email: 'admin@test.com',
      passwordHash,
      role: 'ADMIN',
      name: 'Admin',
      defaultWorkspaceId: workspace.id,
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: 'user1@test.com' },
    update: {
      defaultWorkspaceId: workspace.id,
    },
    create: {
      email: 'user1@test.com',
      passwordHash,
      role: 'USER',
      name: 'User One',
      defaultWorkspaceId: workspace.id,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'user2@test.com' },
    update: {
      defaultWorkspaceId: workspace.id,
    },
    create: {
      email: 'user2@test.com',
      passwordHash,
      role: 'USER',
      name: 'User Two',
      defaultWorkspaceId: workspace.id,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: admin.id },
    },
    update: { role: 'ADMIN' },
    create: { workspaceId: workspace.id, userId: admin.id, role: 'ADMIN' },
  });

  for (const user of [user1, user2]) {
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
      },
      update: { role: 'MEMBER' },
      create: { workspaceId: workspace.id, userId: user.id, role: 'MEMBER' },
    });
  }

  console.log('Seeded users:');
  console.log('Admin:', admin.id);
  console.log('User1:', user1.id);
  console.log('User2:', user2.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
