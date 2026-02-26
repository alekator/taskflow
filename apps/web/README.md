# TaskFlow Web

Frontend workspace for TaskFlow (`Next.js 16`, `React 19`, TypeScript).

## Run

From repo root:

```bash
pnpm install
pnpm dev
```

Default URLs:

- web: `http://localhost:3002`
- api: `http://localhost:3001/api`

## Environment

Copy env template:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Main variable:

- `NEXT_PUBLIC_API_URL` - backend API base URL (`http://localhost:3001/api` for local)

## Quality Gates

From `apps/web`:

```bash
npm run lint
npm run check-types
npm run build
```

## Playwright E2E (smoke)

Setup once:

```bash
pnpm --filter web exec playwright install
```

Run tests:

```bash
pnpm --filter web test:e2e
```

E2E env vars (optional):

- `E2E_BASE_URL` (default `http://localhost:3002`)
- `E2E_ADMIN_EMAIL` (default `admin@test.com`)
- `E2E_ADMIN_PASSWORD` (default `123456`)

## Implemented Screens

- `/` landing
- `/auth/login` auth page
- `/app` live overview dashboard (KPI + readiness + recent audit)
- `/app/projects` projects list/create/search
- `/app/projects/:projectId` project details (members, tasks, kanban, realtime feed)
- `/app/audit` audit timeline with filters

