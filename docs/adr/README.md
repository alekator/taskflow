# Architecture Decision Records

This folder documents key architectural decisions for TaskFlow.

## Index

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](./0001-workspace-tenancy-scope.md) | Workspace-scoped tenancy and access resolution | Accepted | 2026-03-09 |
| [0002](./0002-rbac-layering.md) | Layered RBAC across global, workspace, and project scopes | Accepted | 2026-03-09 |
| [0003](./0003-idempotency-and-async-jobs.md) | Idempotent writes and async job execution model | Accepted | 2026-03-09 |
| [0004](./0004-audit-log-hash-chain.md) | Tamper-evident audit log hash-chain with integrity verification | Accepted | 2026-03-09 |
| [0005](./0005-observability-and-alerting.md) | Prometheus-first observability and alerting pack | Accepted | 2026-03-09 |

## ADR status values

- `Accepted`: decision is active in code.
- `Superseded`: replaced by a newer ADR.
- `Proposed`: drafted but not yet finalized.
