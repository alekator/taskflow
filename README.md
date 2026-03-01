# TaskFlow

Open-source team workspace for projects, tasks, ownership, audit visibility, and realtime progress.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Production_Ready-2496ED?style=flat-square)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square)

TaskFlow is a full-stack monorepo that combines a production-oriented NestJS API with a polished Next.js and React frontend. It is built to feel like a real product: secure auth, role-aware collaboration, concurrency-safe writes, audit trails, realtime updates, and a premium workspace UI.

## Launch Vision

TaskFlow is built for teams that move fast and still need structure. It turns scattered updates, task drift, and hidden ownership into one visible operating surface for delivery.

It is a strong fit when you want:

- clear project ownership
- visible task movement
- safe, concurrency-aware updates
- traceable business actions
- fast setup without enterprise bloat

It is designed to work both as:

- a usable internal team tool
- a strong open-source portfolio project
- a production-ready base for a hosted SaaS product

## What Makes It Strong

TaskFlow is not just a CRUD dashboard. It is opinionated around product-grade reliability:

- writes can be retried safely
- stale clients cannot silently overwrite newer data
- important actions stay auditable
- frontend screens are built to feel like a real product, not scaffolding
- the repo already ships with a real production deployment path

## Highlights

- Full-stack monorepo with `NestJS`, `Next.js`, `Prisma`, `PostgreSQL`, and `Socket.IO`
- Premium landing page and polished workspace UI
- JWT auth with refresh rotation
- Role-aware workspace and project permissions
- Project and task management with assignment workflows
- Optimistic concurrency control with `If-Match`
- Idempotent write protection with `Idempotency-Key`
- Hash-chained audit log for critical actions
- Realtime project updates over Socket.IO
- Optional AI assistant mode with zero-cost fallback
- Local one-command bootstrap
- Dockerized production deployment with nginx reverse proxy

## Screenshots

Full visual tour of the product surface, from landing to the signed-in workspace.

### Landing

The public front door: brand, product story, and the live product preview that makes the repository feel like a serious application from the first scroll.

![TaskFlow Landing](./docs/screenshots/01-landing.png)

### Workspace Overview

The signed-in command surface: runtime telemetry, live workspace canvas, and recent activity in one place.

![Workspace Overview](./docs/screenshots/02-workspace-overview.png)

### Project Board

The core collaboration screen: members, project activity, and a dense board view that keeps active work visible.

![Project Details Board](./docs/screenshots/03-project-details.png)

### Project Index

Project creation and project discovery in one screen, including search, filters, and quick entry into active boards.

![Project List](./docs/screenshots/04-project-list.png)

### Task Detail and Roadmap

Detailed task editing plus the roadmap canvas for planning, diagrams, notes, and visual task execution context.

![Task Detail](./docs/screenshots/05-task-detail.png)

### Workspace Task List

Cross-project task visibility with filtering, version-aware status context, and fast entry back into the relevant board.

![Task List](./docs/screenshots/06-task-list.png)

### Users Directory

A workspace-wide people view showing role, project scope, and workload signals across the system.

![Users List](./docs/screenshots/08-users-list.png)

### Audit Timeline

Administrative event history with request tracing, actor visibility, and hash-chain metadata.

![Audit Timeline](./docs/screenshots/07-audit-timeline.png)

## Feature Set

### Product and UX

- Marketing landing page with premium product presentation
- Dedicated auth flow for sign in and registration
- Unified workspace shell with sidebar and topbar navigation
- Responsive, product-style UI rather than starter-template layouts

### Projects and Tasks

- Create and manage projects
- Add, remove, and re-role project members
- Create, list, update, assign, unassign, and delete tasks
- Workspace-wide task views
- Task detail page with roadmap support

### Security and Reliability

- Access + refresh JWT flow
- Refresh token rotation
- Strict validation and throttling
- `helmet` hardening
- Production CORS allow-list
- Optimistic concurrency for safe updates
- Idempotent writes for retry-safe clients

### Visibility and Collaboration

- Workspace overview dashboard
- Realtime project updates via Socket.IO
- Notification and activity views
- Tamper-evident audit records
- Request correlation with `x-request-id`

### Assistant

- Workspace-aware assistant endpoints
- Free `BASIC` mode using internal workspace data
- Optional `LLM` mode through OpenAI-compatible configuration
- Automatic fallback to local mode when provider is unavailable

## Tech Stack

### Backend

- `NestJS 11`
- `TypeScript`
- `Prisma ORM`
- `PostgreSQL`
- `Socket.IO`
- `Swagger / OpenAPI`
- `Jest + Supertest`

### Frontend

- `Next.js 16` (App Router)
- `React 19`
- `TypeScript`
- `socket.io-client`
- `Playwright`

### Infrastructure

- `Docker`
- `Docker Compose`
- `nginx`
- `pnpm`
- `Turborepo`

## Monorepo Structure

```text
apps/
  api/        NestJS backend API
  web/        Next.js frontend app
packages/
  ui/         Shared UI primitives
  eslint-config/
  typescript-config/
deploy/
  nginx.prod.conf
```

## Key Architecture

```mermaid
flowchart LR
  Browser[Browser] --> Nginx[nginx]
  Nginx --> Web[Next.js Web]
  Nginx --> API[NestJS API]
  API --> Prisma[Prisma]
  Prisma --> Postgres[(PostgreSQL)]
  API --> Realtime[Socket.IO Gateway]
  Browser -. websocket .-> Realtime
  API -. optional .-> LLM[OpenAI-Compatible Provider]
```

## Quick Start

### Prerequisites

- `Node.js 18+`
- `pnpm`
- `Docker`

### One-Command Local Bootstrap

From the repository root:

```bash
pnpm setup:dev
```

This command:

- creates missing local env files
- installs dependencies
- starts PostgreSQL and Redis
- applies Prisma migrations
- seeds the database
- starts the full development workspace

This is the fastest way to get a fresh clone into a working state.

### Local URLs

- Web: `http://localhost:3002`
- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/api/docs`

## Demo Accounts

Base seed includes:

- `admin@test.com`
- `user1@test.com`
- `user2@test.com`

Password for seeded demo users:

- `123456`

## Development Commands

### Monorepo

- `pnpm dev` - start the full development workspace
- `pnpm build` - build all packages
- `pnpm lint` - run lint across the monorepo
- `pnpm check-types` - run type checks across the monorepo
- `pnpm format` - run Prettier on supported files

### Backend

- `pnpm --filter api dev`
- `pnpm --filter api build`
- `pnpm --filter api start:prod`
- `pnpm --filter api lint`
- `pnpm --filter api test:unit`
- `pnpm --filter api test:quality`
- `pnpm --filter api test:e2e`
- `pnpm --filter api test:e2e:ci`
- `pnpm --filter api seed:workflow`
- `pnpm --filter api seed:workflow:heavy`

### Frontend

- `pnpm --filter web dev`
- `pnpm --filter web build`
- `pnpm --filter web start`
- `pnpm --filter web lint`
- `pnpm --filter web check-types`
- `pnpm --filter web test:e2e`
- `pnpm --filter web test:e2e:ui`
- `pnpm --filter web exec playwright install`

## Production Deployment

TaskFlow includes a Dockerized production deployment path out of the box.

Included files:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `apps/api/.env.production.example`
- `docker-compose.prod.yml`
- `deploy/nginx.prod.conf`

### Production Quick Start

1. Create the backend production env file:

```bash
cp apps/api/.env.production.example apps/api/.env.production
```

2. Edit `apps/api/.env.production` and set:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGINS`

3. Start the production stack:

```bash
pnpm prod:up
```

This starts:

- PostgreSQL
- Redis
- NestJS API
- Next.js web app
- nginx reverse proxy on port `80`

This means a fresh server can boot the full product stack with one production command after env setup.

### Production URLs

- App: `http://YOUR_SERVER_IP/`
- API: `http://YOUR_SERVER_IP/api`
- Swagger: `http://YOUR_SERVER_IP/api/docs`

### Production Commands

- `pnpm prod:up`
- `pnpm prod:logs`
- `pnpm prod:down`

## Testing

### Backend

- Unit tests for services and controllers
- E2E coverage for core API workflows
- Coverage thresholds on critical backend modules

### Frontend

- Playwright end-to-end tests for real user flows
- Navigation and key app paths tested through the browser layer

## Package Docs

For package-specific technical references:

- Backend doc: [apps/api/README.md](./apps/api/README.md)
- Frontend doc: [apps/web/README.md](./apps/web/README.md)

## Use Cases

TaskFlow is a strong base for:

- internal team workspaces
- startup MVPs for project management
- portfolio-grade full-stack architecture showcases
- open-source experimentation with auth, concurrency, auditability, and realtime collaboration

## Roadmap

Potential next steps for the project:

- richer notification center with read/unread state controls
- expanded frontend unit/component test coverage
- file attachments for tasks and projects
- invitation flows by email
- deeper assistant workflows and project summaries
- deployment presets for TLS and cloud hosting
- metrics and health dashboards for ops visibility

## Open-Source Ready

TaskFlow already has the pieces that make an open-source launch credible:

- a real backend architecture
- a polished frontend experience
- tests across backend and frontend flows
- production deployment documentation
- package-level docs for both major apps

That makes this repository easy to understand, run locally, evaluate, and extend.

## Contributing

If you want to extend TaskFlow:

1. Fork the repository
2. Run `pnpm setup:dev`
3. Create a feature branch
4. Add tests for behavior changes
5. Open a pull request

Keeping contributions aligned with the current style matters:

- concise, useful comments
- production-minded code paths
- test coverage for critical logic
- no unnecessary boilerplate

## License

This project is currently private-source in structure but prepared to be published as open source.

If you plan to publish it publicly, add the final license file you want to distribute with the repository, for example:

- `MIT`
- `Apache-2.0`
- `GPL-3.0`

## Status

TaskFlow already includes:

- a working backend API
- a polished frontend application
- automated tests
- Dockerized production deployment
- package-level technical documentation

The next natural step is revision, refinement, and modification.
