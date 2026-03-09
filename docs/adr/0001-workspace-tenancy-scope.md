# ADR 0001: Workspace-scoped tenancy and access resolution

- Status: Accepted
- Date: 2026-03-09

## Context

TaskFlow supports multiple workspaces while keeping API and DB schema simple. Each request must resolve the active workspace consistently, and every list/read/write query must stay workspace-scoped.

The codebase currently relies on:

- `WorkspaceAccessService.getRequiredWorkspace(userId)` as a single resolver for active workspace and membership role.
- `user.defaultWorkspaceId` as a preferred workspace pointer.
- Fallback to the earliest existing `workspaceMember` record if default workspace is missing or stale.

## Decision

Use workspace-scoped tenancy with explicit server-side workspace resolution per request:

- Resolve workspace once via `WorkspaceAccessService`.
- Scope every business query by resolved `workspaceId`.
- Auto-heal users with missing default workspace by assigning first membership.
- Reject access when user has no workspace membership.

## Consequences

### Positive

- Consistent tenant boundaries across modules (projects, tasks, audit, users, invitations, billing).
- Safer migration path for legacy users created before workspace model hardening.
- Centralized access logic reduces drift and duplicated checks.

### Trade-offs

- A user session can only operate against one active workspace at a time.
- Workspace switching is a stateful concern (`defaultWorkspaceId`) and may need explicit UX/API later.

## Alternatives considered

- Passing `workspaceId` from client headers/params for each request.
  - Rejected due to spoofing risk and duplicated authorization checks.
- Dedicated tenant middleware with implicit query rewriting.
  - Rejected for now due to complexity and lower transparency versus explicit service calls.
