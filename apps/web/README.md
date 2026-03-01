# TaskFlow Web

Frontend application for TaskFlow, built with Next.js App Router and React. It provides the product landing page, authentication flows, and the full signed-in workspace UI for projects, tasks, users, activity, notifications, and realtime collaboration.

## Overview

This frontend is designed to feel like a real product shell, not just a set of forms. It covers:

- a polished marketing landing page
- authentication and session persistence
- a workspace app shell with sidebar and topbar navigation
- project, task, user, and audit views
- realtime updates from the backend
- optimistic interactions for smoother task and project workflows
- production-ready build and Docker packaging

Default local URL: `http://localhost:3002`

## Frontend Features

### Marketing and Entry Flow

- Premium landing page at `/`
- Clear product messaging and CTA path into the app
- Dedicated auth routes:
  - `/auth/login`
  - `/auth/register`

### Auth Experience

- Sign in / register forms
- Access token and refresh-aware client flow
- Session-aware redirects into the app workspace
- Shared auth provider for client-side user state

### Workspace Application

- `/app` workspace overview dashboard
- `/app/projects` project listing and creation
- `/app/projects/[projectId]` detailed project workspace
- `/app/tasks` workspace-wide task list
- `/app/tasks/[taskId]` task detail and roadmap panel
- `/app/users` workspace user directory
- `/app/audit` workspace activity and audit timeline

### Project Workspace Experience

- Project detail screen with tabbed workspace sections
- Members, tasks, and activity context in one place
- Kanban-style task representation
- Role-aware actions based on permissions returned by the API
- Realtime project room updates through Socket.IO

### Task Experience

- Workspace task listing with filters and pagination
- Task detail page with richer status and metadata editing
- Dedicated roadmap panel for roadmap-specific task planning data
- Quick status changes and refresh-safe updates

### Notifications and Activity

- Notification UI layer for recent events
- Audit/activity timeline for workspace visibility
- Workspace overview metrics and live canvas composition

### UX and UI Patterns

- Shared app shell with consistent navigation
- Workspace ambient stage and premium landing visuals
- Responsive layouts for desktop and smaller screens
- Soft animated landing presentation with motion fallbacks
- Premium, product-focused visual language rather than default boilerplate SaaS styling

## Tech Stack

- `Next.js 16` (App Router)
- `React 19`
- `TypeScript`
- `socket.io-client`
- `Playwright`
- shared workspace package `@repo/ui`
- CSS authored in `app/globals.css`

## App Structure

```text
apps/web
  app/
    page.tsx                 Landing page
    auth/login/page.tsx      Login
    auth/register/page.tsx   Registration
    app/page.tsx             Workspace overview
    app/projects/page.tsx    Projects list
    app/projects/[projectId] Project details
    app/tasks/page.tsx       Tasks list
    app/tasks/[taskId]       Task details
    app/users/page.tsx       Users directory
    app/audit/page.tsx       Audit timeline
  src/
    components/
      auth/                  Auth UI and session helpers
      assistant/             Assistant UI pieces
      feedback/              Empty, loading, and message states
      layout/                Sidebar, topbar, shell pieces
      overview/              Workspace overview widgets
      tasks/                 Task detail widgets
    lib/
      auth/                  Auth API and session helpers
      audit/                 Audit API calls
      notifications/         Notification data access
      projects/              Project API calls and types
      realtime/              Socket connection hooks
      system/                Runtime/system data helpers
      tasks/                 Task API calls and types
      users/                 User API calls and types
```

## Data and Client Architecture

### API Integration

The frontend talks to the backend through `NEXT_PUBLIC_API_URL`.

Typical local value:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

For Docker production, the web build is configured to use same-origin `/api`, so requests flow through nginx without a separate public API host.

### Realtime

- Uses `socket.io-client`
- Connects to the backend realtime namespace
- Subscribes to project-scoped updates
- Keeps active workspace views fresh when project/task state changes

### Session Handling

- Client-side auth provider stores and exposes current user state
- API helpers route authenticated requests through a shared fetch layer
- Session-aware pages can redirect or guard based on auth readiness

## Local Development

### Prerequisites

- `Node.js 18+`
- `pnpm`
- Backend API running locally at `http://localhost:3001/api`

### Quick Start from Repo Root

If you want the full monorepo dev stack:

```bash
pnpm setup:dev
```

This is the fastest way to get both backend and frontend running together.

### Frontend-Only Local Start

1. Create frontend env:

```bash
cp apps/web/.env.example apps/web/.env.local
```

2. Start the frontend from the repo root:

```bash
pnpm --filter web dev
```

3. Open:

- app: `http://localhost:3002`
- expected backend API: `http://localhost:3001/api`

## Production

The frontend is included in the repository-level production deployment stack.

Relevant files:

- `apps/web/Dockerfile`
- `docker-compose.prod.yml`
- `deploy/nginx.prod.conf`

### Production Build

Run from the repository root:

```bash
pnpm --filter web build
```

### Production Start

Run from the repository root:

```bash
pnpm --filter web start
```

### Full Docker Production Stack

The preferred production path is the shared Docker stack:

```bash
pnpm prod:up
```

This serves the frontend behind nginx on port `80`.

## Environment Variables

Copy from `apps/web/.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | Backend API base URL used by browser requests |
| `E2E_BASE_URL` | no | Base URL for Playwright |
| `E2E_ADMIN_EMAIL` | no | Default e2e login email |
| `E2E_ADMIN_PASSWORD` | no | Default e2e login password |

## Commands

Run these from the repository root unless noted otherwise.

### Development

- `pnpm --filter web dev` - start the Next.js dev server on port `3002`
- `pnpm --filter web build` - create the production build
- `pnpm --filter web start` - start the production server

### Quality

- `pnpm --filter web lint` - run ESLint with zero warnings allowed
- `pnpm --filter web check-types` - generate Next types and run TypeScript checks

### End-to-End Testing

- `pnpm --filter web test:e2e` - run Playwright e2e tests
- `pnpm --filter web test:e2e:ui` - run Playwright with interactive UI mode
- `pnpm --filter web exec playwright install` - install Playwright browsers once

## Testing Strategy

The frontend currently uses Playwright e2e coverage for real user flows, including:

- landing and auth entry paths
- navigation into the workspace
- workspace screens loading correctly
- critical task/project interactions

This keeps testing focused on real behavior instead of shallow component snapshots.

## Implemented Screens

### Public Routes

- `/` - marketing landing page
- `/auth/login` - login flow
- `/auth/register` - account creation

### App Routes

- `/app` - workspace overview dashboard
- `/app/projects` - projects list and create entry
- `/app/projects/[projectId]` - project details, members, tasks, activity
- `/app/tasks` - workspace tasks
- `/app/tasks/[taskId]` - task detail and roadmap editing
- `/app/users` - workspace users
- `/app/audit` - audit timeline

## UI and Experience Highlights

- Premium landing page with strong visual hierarchy and product preview
- Dedicated workspace shell separate from public marketing UI
- Sidebar navigation for main workspace areas
- Topbar metadata and quick access elements
- Workspace overview with live telemetry and visual pulse canvas
- Dense, product-oriented UI instead of generic starter styling

## Notes

- This README is frontend-only on purpose.
- It is intended to be the technical reference for the web app package.
- It pairs with `apps/api/README.md` so the final repository README can be assembled from both.
