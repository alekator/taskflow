# TaskFlow API

NestJS backend for TaskFlow.

## Stack

- NestJS 11
- Prisma ORM
- PostgreSQL
- JWT (access + refresh rotation)
- Role-based access control (projects/members/tasks)
- Swagger
- Jest + Supertest (unit + e2e)

## Run Locally

### 1. Environment

Create `.env` from template:

```bash
cp .env.example .env
```

### 2. Infrastructure

From repo root:

```bash
docker compose up -d
```

### 3. Database

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

### 4. Start API

```bash
pnpm run dev
```

## Scripts

- `pnpm run dev` - start with watch
- `pnpm run build` - build app
- `pnpm run lint` - lint (`eslint`)
- `pnpm run test:unit` - unit tests
- `pnpm run test:quality` - unit tests + coverage thresholds
- `pnpm run test:e2e` - e2e tests
- `pnpm run test:e2e:ci` - e2e tests in-band (stable for CI)

## API Docs

- Swagger: `http://localhost:3001/api/docs`
- Base: `http://localhost:3001/api`
