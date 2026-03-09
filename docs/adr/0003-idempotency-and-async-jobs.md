# ADR 0003: Idempotent writes and async job execution model

- Status: Accepted
- Date: 2026-03-09

## Context

TaskFlow has write operations that clients may retry due to network failures and background workflows that should not break user-facing API paths.

Implemented mechanisms:

- `IdempotencyInterceptor` for `POST`, `PATCH`, `DELETE` with `Idempotency-Key`.
- `IdempotencyService` storing request hash and response snapshots.
- `async-jobs` runner for deferred tasks (for example invitation email dispatch).

## Decision

Adopt database-backed idempotency plus explicit async job processing:

- Compute canonical request hash from body/params/query.
- Uniqueness key: `(actorUserId, method, path, key)`.
- Replay completed response for safe client retries.
- Return conflict while same key is in progress.
- Delete in-progress record on handler error, allowing retry.
- Process deferred workloads through `AsyncJobsService` with run loop and failure accounting.

## Consequences

### Positive

- Prevents duplicate side effects from client retries.
- Makes client retry behavior deterministic.
- Decouples non-critical work (email/integrations) from request latency path.

### Trade-offs

- Requires careful payload canonicalization and response serialization.
- In-progress collisions surface as 409 and must be handled by clients.
- Async job reliability still depends on scheduler/trigger strategy.

## Alternatives considered

- At-least-once processing without idempotency keys.
  - Rejected due to duplicate business actions under retries.
- Broker-only async architecture (RabbitMQ/Kafka) for all deferred work.
  - Deferred; current DB-backed queue is simpler and sufficient for current scale.
