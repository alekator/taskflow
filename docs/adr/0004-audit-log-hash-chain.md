# ADR 0004: Tamper-evident audit log hash-chain with integrity verification

- Status: Accepted
- Date: 2026-03-09

## Context

TaskFlow records security-relevant and domain-relevant actions (projects, tasks, memberships, billing, invitations, async side effects). For credibility and incident analysis, the audit trail must be difficult to tamper with silently.

Current implementation in `AuditService`:

- On every audit record, stores `prevHash` and `hash`.
- Hash input includes immutable event fields plus request metadata and payload.
- Exposes admin endpoint `GET /admin/audit/verify` for full-chain verification.

## Decision

Use append-only hash-chain semantics for audit logs:

- On write, read latest hash and compute next record hash with `sha256`.
- Persist chain links in DB (`prevHash`, `hash`).
- Expose integrity verification API for administrators.
- Fail-open on audit write errors to avoid blocking user-facing operations.

## Consequences

### Positive

- Provides tamper evidence for historical audit records.
- Verification endpoint gives operationally useful integrity signal.
- Hashing strategy is deterministic using canonical JSON serialization.

### Trade-offs

- Verification is O(n) over audit log size.
- Fail-open logging can drop some events during DB incidents.
- Not equivalent to external immutable ledger; DB admins can still rewrite data if they recompute chain.

## Alternatives considered

- Plain audit table without chain.
  - Rejected due to weak tamper visibility.
- External WORM storage or third-party audit ledger.
  - Deferred because of operational overhead and current project scope.
