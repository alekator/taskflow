# TaskFlow API

Production-oriented NestJS backend for TaskFlow: authentication, projects, tasks, auditability, realtime delivery, assistant features, and deployment-ready infrastructure.

## Overview

This backend is designed as a real product API, not a demo-only mock. It focuses on:

- secure JWT-based auth with refresh rotation
- role-aware access control at both workspace and project level
- concurrency-safe writes for projects and tasks
- idempotent write protection for retry-safe clients
- traceable audit logging for critical business actions
- realtime project updates over Socket.IO
- structured validation, throttling, and consistent API errors
- optional AI assistant integration with a zero-cost fallback mode

Base HTTP prefix: `http://localhost:3001/api`

## Core Capabilities

### Authentication and Sessions

- Email/password registration and login
- Access + refresh token pair
- Refresh token rotation with server-side invalidation
- Role-aware self-registration:
  - `USER` can self-register directly
  - `MANAGER` and `ADMIN` registration can be gated by invite codes
- Logout revokes the current refresh token chain

### Workspace and Project Management

- Create, list, view, update, and delete projects
- Project membership management:
  - add members
  - change member roles
  - remove members
  - self-leave for non-owner members
- Role-sensitive write rules for owners, managers, and members

### Task Management

- Project-scoped task CRUD
- Workspace-wide task listing
- Task assignment and unassignment
- Status, priority, ownership, and metadata updates
- Dedicated task detail endpoint
- Task roadmap endpoint for roadmap-specific planning data

### Audit and Traceability

- Append-only audit entries for significant events
- Hash-chained records (`prevHash` + `hash`) to make tampering detectable
- Request metadata stored with business actions:
  - request ID
  - IP
  - user agent
- Admin-only workspace audit log access

### Realtime

- Socket.IO namespace: `/realtime`
- Project room model: `project:{projectId}`
- Emits domain events for project, member, and task changes
- Used by the frontend to keep workspace views fresh without full reloads

### API Hardening

- Global validation pipe
- Request throttling
- `helmet` security headers
- strict production CORS allow-list
- consistent exception payloads
- Prisma error mapping for common DB failures

### Reliability Controls

- Idempotent write support via `Idempotency-Key`
- Optimistic concurrency control via `If-Match`
- Versioned entities to prevent stale overwrites
- Stable pagination contracts for list endpoints

### Assistant

- `/assistant` endpoints for workspace-aware assistant messaging
- Two operating modes:
  - `BASIC`: local, zero-cost workspace-derived answers
  - `LLM`: OpenAI-compatible provider via environment variables
- Automatic fallback to `BASIC` when provider is missing, unavailable, or limited

## Tech Stack

- `NestJS 11`
- `TypeScript`
- `Prisma ORM`
- `PostgreSQL`
- `JWT` via `@nestjs/jwt` and `passport-jwt`
- `Socket.IO`
- `Swagger / OpenAPI`
- `class-validator` + `class-transformer`
- `Jest`
- `Supertest`
- `Docker`

## Module Breakdown

```text
apps/api/src
  assistant/      Assistant endpoints and provider integration
  audit/          Audit log writes and listing
  auth/           Registration, login, refresh, logout, JWT guards
  common/         Filters, request context, pagination, concurrency helpers
  config/         Runtime env validation and environment rules
  idempotency/    Idempotency interceptor and persistence
  notifications/  Workspace notification feed
  prisma/         Prisma module and shared database service
  projects/       Project CRUD and membership workflows
  realtime/       Socket.IO gateway and broadcast service
  tasks/          Task CRUD, assignment, roadmap operations
  users/          Workspace user listing and self-profile
```

## API Surface

### Public and Utility

- `GET /health`
- `GET /`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Projects

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `DELETE /projects/:id`

### Project Members

- `GET /projects/:projectId/members`
- `POST /projects/:projectId/members`
- `PATCH /projects/:projectId/members/:userId`
- `DELETE /projects/:projectId/members/:userId`
- `POST /projects/:projectId/leave`

### Tasks

- `GET /projects/:projectId/tasks`
- `POST /projects/:projectId/tasks`
- `PATCH /projects/:projectId/tasks/:id`
- `DELETE /projects/:projectId/tasks/:id`
- `PATCH /projects/:projectId/tasks/:id/assign`
- `PATCH /projects/:projectId/tasks/:id/unassign`
- `GET /tasks`
- `GET /tasks/:id`
- `GET /tasks/:id/roadmap`
- `PATCH /tasks/:id/roadmap`

### Users

- `GET /users`
- `GET /users/me`

### Notifications

- `GET /notifications`

### Audit

- `GET /audit-logs`

### Assistant

- `GET /assistant/history`
- `POST /assistant/messages`

Interactive contract: `http://localhost:3001/api/docs`

## Important Backend Behaviors

### Idempotent Writes

For supported write requests, clients can send `Idempotency-Key`.

Behavior:

- same key + same payload -> previously stored response is replayed
- same key + different payload -> `409 Conflict`
- duplicate in-flight request -> `409 Conflict`

This prevents accidental duplicate side effects from retries.

### Optimistic Concurrency

Projects and tasks are versioned.

For concurrency-sensitive `PATCH` and `DELETE` endpoints:

- missing `If-Match` -> `428 Precondition Required`
- stale `If-Match` -> `412 Precondition Failed`
- valid `If-Match` -> update succeeds and version increments

This prevents lost updates when multiple clients edit the same entity.

### Audit Hash Chain

Each audit record links to the previous one with `prevHash`, then computes its own `hash` from canonicalized data. That means:

- history remains append-oriented
- record tampering becomes detectable
- critical business actions remain traceable

## Environment Variables

Copy from `apps/api/.env.example` for local development or `apps/api/.env.production.example` for Docker production.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | no | `development`, `test`, or `production` |
| `PORT` | no | API port, defaults to `3001` |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | Access token signing secret |
| `JWT_REFRESH_SECRET` | yes | Refresh token signing secret |
| `AUTH_MANAGER_INVITE_CODE` | no | Invite code for manager self-registration |
| `AUTH_ADMIN_INVITE_CODE` | no | Invite code for admin self-registration |
| `ASSISTANT_OPENAI_API_KEY` | no | Enables external LLM mode |
| `ASSISTANT_OPENAI_MODEL` | no | Model used in LLM mode |
| `ASSISTANT_OPENAI_BASE_URL` | no | OpenAI-compatible provider URL |
| `ASSISTANT_DAILY_LIMIT` | no | Per-user daily assistant limit |
| `ASSISTANT_MAX_OUTPUT_TOKENS` | no | Completion length cap |
| `ASSISTANT_LLM_TIMEOUT_MS` | no | Provider request timeout |
| `ASSISTANT_TEMPERATURE` | no | LLM temperature |
| `CORS_ORIGINS` | production yes | Comma-separated allowed origins |
| `THROTTLE_TTL_MS` | no | Global throttling window |
| `THROTTLE_LIMIT` | no | Global throttling limit |
| `AUTH_THROTTLE_TTL_MS` | no | Auth throttling window |
| `AUTH_THROTTLE_LIMIT` | no | Auth throttling limit |

## Local Development

### Prerequisites

- `Node.js 18+`
- `pnpm`
- `Docker`

### Quick Start from Repo Root

```bash
pnpm setup:dev
```

This installs dependencies, prepares env files, starts Postgres and Redis, applies migrations, seeds the database, and launches the dev workspace.

### Manual Local Start

1. Start infrastructure from the repository root:

```bash
docker compose up -d
```

2. Create backend env file:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Apply migrations:

```bash
pnpm --filter api exec prisma migrate deploy
```

4. Seed the database:

```bash
pnpm --filter api exec prisma db seed
```

5. Start the API in watch mode:

```bash
pnpm --filter api dev
```

Swagger UI: `http://localhost:3001/api/docs`

## Production

The backend is included in the repository-level Docker production stack.

Relevant files:

- `apps/api/Dockerfile`
- `apps/api/.env.production.example`
- `docker-compose.prod.yml`

### Production Quick Start

1. Prepare production env:

```bash
cp apps/api/.env.production.example apps/api/.env.production
```

2. Set real secrets and public CORS origin.

3. Start the full production stack from the repo root:

```bash
pnpm prod:up
```

The API container automatically runs `prisma migrate deploy` before boot.

## Demo Data and Seeding

### Base Seed

Standard Prisma seed creates initial users such as:

- `admin@test.com`
- `user1@test.com`
- `user2@test.com`

Default password: `123456`

### Workspace Demo Seed

For richer demo data:

```bash
pnpm --filter api seed:workflow
```

Heavy showcase dataset:

```bash
pnpm --filter api seed:workflow:heavy
```

These scripts generate projects, tasks, memberships, and audit activity suitable for realistic UI demos.

## Commands

Run these from the repository root unless noted otherwise.

### Development Commands

- `pnpm --filter api dev` - start the API in watch mode
- `pnpm --filter api start` - start without watch
- `pnpm --filter api start:dev` - explicit watch-mode alias
- `pnpm --filter api start:debug` - start with Nest debug watcher
- `pnpm --filter api build` - compile the backend
- `pnpm --filter api start:prod` - run the compiled app directly

### Database and Seeding

- `pnpm --filter api exec prisma migrate deploy` - apply migrations
- `pnpm --filter api exec prisma db seed` - run the base Prisma seed
- `pnpm --filter api seed:workflow` - create a realistic demo workspace
- `pnpm --filter api seed:workflow:heavy` - create a dense showcase dataset

### Quality and Formatting

- `pnpm --filter api lint` - run ESLint with autofix
- `pnpm --filter api format` - run Prettier on backend source and tests
- `pnpm --filter api test` - run Jest in default mode
- `pnpm --filter api test:unit` - run unit tests in-band
- `pnpm --filter api test:watch` - Jest watch mode
- `pnpm --filter api test:cov` - generate test coverage
- `pnpm --filter api test:quality` - coverage-enforced quality gate
- `pnpm --filter api test:debug` - debug Jest with Node inspector
- `pnpm --filter api test:e2e` - backend e2e suite
- `pnpm --filter api test:e2e:ci` - stable in-band e2e mode

## Testing Strategy

The backend uses:

- unit tests for critical services and controllers
- end-to-end tests for full API contracts
- coverage thresholds for high-value modules

This helps protect:

- auth flows
- task and project business logic
- API hardening behavior
- role checks and workspace policies

## Example Requests

### Register

```bash
curl -X POST "http://localhost:3001/api/auth/register" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"owner@example.com\",\"password\":\"123456\",\"name\":\"Owner\"}"
```

### Login

```bash
curl -X POST "http://localhost:3001/api/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@test.com\",\"password\":\"123456\"}"
```

### Idempotent Project Create

```bash
curl -X POST "http://localhost:3001/api/projects" ^
  -H "Authorization: Bearer <access-token>" ^
  -H "Content-Type: application/json" ^
  -H "Idempotency-Key: proj-create-001" ^
  -d "{\"name\":\"Roadmap\",\"description\":\"Q1 planning\"}"
```

### Concurrency-Safe Task Update

```bash
curl -X PATCH "http://localhost:3001/api/projects/<projectId>/tasks/<taskId>" ^
  -H "Authorization: Bearer <access-token>" ^
  -H "Content-Type: application/json" ^
  -H "If-Match: 3" ^
  -d "{\"status\":\"DONE\"}"
```

## Notes

- This README is backend-only on purpose.
- It is meant to act as a technical reference for the API package.
- A final repository-level README can now be assembled from this backend doc plus the frontend package doc.
