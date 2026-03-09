# Benchmark Report

This document tracks reproducible load-test snapshots for TaskFlow API.

## Scope

- Target service: `apps/api`
- Baseline endpoints:
  - `GET /api/health`
  - `GET /api/metrics`
- Tooling:
  - `autocannon` for quick throughput/latency checks
  - `k6` for smoke thresholds and repeatable CI-friendly profile

## Environment Template

- Date:
- Commit SHA:
- Host CPU/RAM:
- Node version:
- Database mode: local Postgres / managed Postgres
- Dataset profile: empty / demo / heavy

## Commands

Autocannon:

```bash
pnpm bench:api:autocannon
```

Optional variables:

```bash
BENCH_TARGET_URL=http://localhost:3001/api/health
BENCH_CONNECTIONS=50
BENCH_DURATION_SECONDS=30
BENCH_WORKERS=2
BENCH_TIMEOUT_SECONDS=20
```

Artifacts are saved under `scripts/load/results/autocannon-*.json`.

k6 smoke profile:

```bash
pnpm bench:api:k6
```

Optional variables:

```bash
BENCH_BASE_URL=http://localhost:3001/api
BENCH_K6_VUS=20
BENCH_K6_DURATION=45s
```

## Latest Results

### Run #1

- Date:
- Commit:
- Environment:
- Dataset:
- Autocannon:
  - Req/sec:
  - Avg latency:
  - p95 latency:
  - Non-2xx:
- k6:
  - http_req_failed:
  - p95 duration:
  - Threshold pass/fail:
- Notes:

## Interpretation Notes

- Compare results only across similar host and dataset conditions.
- Track p95 first; average latency can hide tail regressions.
- Investigate spikes with:
  - `taskflow_http_request_duration_p95_ms`
  - `taskflow_http_request_errors_total`
  - `taskflow_async_jobs_failed_recent`
