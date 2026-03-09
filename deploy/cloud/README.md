# Cloud Presets

This directory contains starter deployment presets for common cloud targets.

## Render

- File: `deploy/cloud/render/render.yaml`
- Includes:
  - `taskflow-api` web service
  - `taskflow-web` web service
  - managed Postgres database

Use:

1. Import repository in Render.
2. Select Blueprint deploy and point to `deploy/cloud/render/render.yaml`.
3. Set missing secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) and adjust public domains.

## Fly.io

- Files:
  - `deploy/cloud/fly/api.fly.toml`
  - `deploy/cloud/fly/web.fly.toml`

Use:

1. Create Fly apps for API and web (`flyctl apps create ...`).
2. Deploy each service with corresponding config:
   - `flyctl deploy -c deploy/cloud/fly/api.fly.toml`
   - `flyctl deploy -c deploy/cloud/fly/web.fly.toml`
3. Set required secrets:
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`

## Railway

- File: `deploy/cloud/railway/railway.json`
- Use as baseline metadata for Railway deploy/restart policy.

Recommended service split on Railway:

1. API service from `apps/api/Dockerfile`
2. Web service from `apps/web/Dockerfile`
3. PostgreSQL plugin/service
4. Redis plugin/service

Set environment variables from `apps/api/.env.production.example` and set web
`NEXT_PUBLIC_API_URL` to your Railway API domain plus `/api`.
