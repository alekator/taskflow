# ADR 0002: Layered RBAC across global, workspace, and project scopes

- Status: Accepted
- Date: 2026-03-09

## Context

TaskFlow authorization spans several scopes:

- Global user role (`UserRole`: `ADMIN`, `MANAGER`, `USER`) from JWT.
- Workspace membership role (`WorkspaceMemberRole`) for workspace-level operations.
- Project role (`ProjectRole`: `OWNER`, `MANAGER`, `MEMBER`) for project-level collaboration.

Different modules need different authority sources. For example:

- `users` and `audit verify` use global role restrictions.
- `invitations` and `billing` require workspace admin role.
- `projects` and `tasks` rely on project role checks with owner-first semantics.

## Decision

Keep RBAC layered instead of collapsing into a single role dimension:

- Global role gates platform-level endpoints and broad admin capabilities.
- Workspace role gates workspace governance actions.
- Project role gates local project operations and member management.
- Apply allow/deny logic in service layer close to business operations.

## Consequences

### Positive

- Fine-grained permissions without role explosion.
- Clear mapping between endpoint intent and required authority scope.
- Easier to evolve each scope independently.

### Trade-offs

- Developers must reason about multiple role systems.
- Tests must cover cross-scope interactions to avoid privilege regressions.

## Alternatives considered

- Single flattened role model.
  - Rejected due to poor expressiveness for mixed workspace/project collaboration.
- Fully policy-engine based RBAC/ABAC.
  - Deferred; current complexity does not justify external policy engine yet.
