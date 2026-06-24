# Workspace Module

## Overview

The workspace module manages collaborative workspaces and their memberships.
Its responsibilities include:

- Creating, reading, updating, and soft-deleting workspaces.
- Assigning workspace roles and enforcing workspace permissions.
- Listing, changing, and removing workspace members.
- Inviting registered and unregistered users.
- Completing invitation acceptance after email verification.
- Maintaining the workspace member count.
- Emitting activity-log and document-access events.

The module is implemented with NestJS and MongoDB. It also uses Redis for
short-lived member-list caching and Resend for invitation emails.

The API base path is:

```text
/api/workspace
```

Successful responses are normally wrapped by the global response interceptor:

```json
{
  "status": "Success",
  "statusCode": 200,
  "data": {}
}
```

## Module Structure

```text
src/modules-api/workspace/
|-- workspace.controller.ts
|-- workspace.module.ts
|-- workspace.service.ts
|-- dto/
|   |-- change-role.dto.ts
|   |-- create-workspace.dto.ts
|   |-- invite-memer.dto.ts
|   `-- update-workspace.dto.ts
`-- schemas/
    |-- workspace-invitation.schema.ts
    |-- workspace-roles.schema.ts
    |-- workspace_members.schema.ts
    `-- workspaces.schema.ts
```

`WorkspaceModule` registers the following MongoDB models:

- `Workspace`
- `WorkspaceMember`
- `WorkspaceInvitation`
- `WorkspaceRole`
- `User`
- `DocumentModel`

The module exports `WorkspaceService` because the authentication module uses it
to resolve and accept workspace invitations during email verification.

## Authentication and Authorization

The workspace controller does not expose public endpoints. Every route first
passes through the global authentication guard.

Resource-specific authorization is enforced by `PermissionGuard` on routes
decorated with `@Permissions(action, resource)`.

For a workspace permission check, the guard:

1. Reads `workspaceId` from route parameters, query parameters, or the body.
2. Validates that it is a MongoDB ObjectId.
3. Finds the authenticated user's active `WorkspaceMember` record.
4. Loads the member's `WorkspaceRole`.
5. Confirms that the role contains the required action and resource.

## Workspace Roles

Roles are seeded with stable IDs.

### Admin

Permissions:

| Action | Resource |
| --- | --- |
| `VIEW` | `WORKSPACE` |
| `EDIT` | `WORKSPACE` |
| `DELETE` | `WORKSPACE` |
| `INVITE` | `MEMBER` |
| `REMOVE` | `MEMBER` |

### Member

Permissions:

| Action | Resource |
| --- | --- |
| `VIEW` | `WORKSPACE` |
| `COMMENT` | `WORKSPACE` |

The current controller uses `EDIT / WORKSPACE` for changing roles and removing
members. As a result, these actions are available to Admin users but not normal
Members.

## Endpoint Summary

| Method | Endpoint | Required permission |
| --- | --- | --- |
| `GET` | `/api/workspace/roles` | Authenticated user |
| `POST` | `/api/workspace` | Authenticated user |
| `GET` | `/api/workspace` | Authenticated user |
| `GET` | `/api/workspace/:workspaceId` | `VIEW / WORKSPACE` |
| `PATCH` | `/api/workspace/:workspaceId` | `EDIT / WORKSPACE` |
| `DELETE` | `/api/workspace/:workspaceId` | `DELETE / WORKSPACE` |
| `GET` | `/api/workspace/:workspaceId/members` | `VIEW / WORKSPACE` |
| `DELETE` | `/api/workspace/:workspaceId/members/:userId` | `EDIT / WORKSPACE` |
| `POST` | `/api/workspace/:workspaceId/change-role` | `EDIT / WORKSPACE` |
| `POST` | `/api/workspace/:workspaceId/invite` | `INVITE / MEMBER` |

## API Endpoints

### Get workspace roles

```http
GET /api/workspace/roles
```

Returns all workspace roles without their internal permission arrays.

Example response data:

```json
[
  {
    "_id": "000000000000000000000001",
    "name": "Admin",
    "description": "Can manage settings & members"
  },
  {
    "_id": "000000000000000000000002",
    "name": "Member",
    "description": "Can create & edit documents"
  }
]
```

### Create a workspace

```http
POST /api/workspace
```

Request body:

```json
{
  "name": "Product Team",
  "description": "Product specifications and research"
}
```

Validation:

- `name` is required.
- `name` has a maximum length of 60 characters.
- `description` is optional and has a schema-level maximum of 255 characters.

Behavior:

1. Creates a workspace with `memberCount` set to `1`.
2. Creates a membership for the creator with the Admin role.
3. Stores the workspace name and description on the membership record.
4. Emits `workspace.member.added`.
5. Emits a `WORKSPACE_CREATION` activity event.

Response data:

```json
{
  "_id": "<workspace id>"
}
```

### List the current user's workspaces

```http
GET /api/workspace
```

The service loads active membership records for the authenticated user,
populates role and workspace information, removes memberships whose workspace
has been deleted, and sorts the results by newest membership first.

Example response data:

```json
[
  {
    "_id": "<workspace id>",
    "workspaceName": "Product Team",
    "workspaceDescription": "Product specifications and research",
    "createdAt": "2026-06-23T00:00:00.000Z",
    "userRole": "Admin",
    "memberCount": 4,
    "joinedAt": "2026-06-23T00:00:00.000Z"
  }
]
```

The workspace name and description in this response come from the denormalized
fields stored on `WorkspaceMember`.

### Get workspace details

```http
GET /api/workspace/:workspaceId
```

Required permission:

```text
VIEW / WORKSPACE
```

The service loads the workspace, its active documents, and the current user's
membership in parallel.

Documents are sorted by creation time in descending order.

Example response data:

```json
{
  "_id": "<workspace id>",
  "name": "Product Team",
  "description": "Product specifications and research",
  "memberCount": 4,
  "created_at": "2026-06-23T00:00:00.000Z",
  "userRole": "Admin",
  "documents": []
}
```

### Update workspace settings

```http
PATCH /api/workspace/:workspaceId
```

Required permission:

```text
EDIT / WORKSPACE
```

Request body:

```json
{
  "name": "Product and Design",
  "description": "Shared product and design documentation"
}
```

All fields are optional because `UpdateWorkspaceDto` is a partial version of
the create DTO.

Behavior:

1. Updates the workspace.
2. Propagates the new name and description to all associated membership
   records.
3. Emits an `UPDATE_SETTINGS` activity event.
4. Returns the updated workspace.

### Delete a workspace

```http
DELETE /api/workspace/:workspaceId
```

Required permission:

```text
DELETE / WORKSPACE
```

Deletion is soft:

- The workspace receives `isDeleted`, `deletedAt`, and `deletedBy`.
- Every associated `WorkspaceMember` record receives the same deletion state.

Response data contains a localized success message.

This operation does not currently hard-delete the workspace, documents,
invitations, or activity logs.

### List workspace members

```http
GET /api/workspace/:workspaceId/members
```

Required permission:

```text
VIEW / WORKSPACE
```

Members are sorted by `joinedAt` in ascending order.

Example response data:

```json
[
  {
    "userId": "<user id>",
    "fullName": "Example User",
    "email": "user@example.com",
    "role": "Admin",
    "roleId": "000000000000000000000001",
    "joinedAt": "2026-06-23T00:00:00.000Z"
  }
]
```

The result is cached in Redis for two seconds:

```text
workspaceMember:<workspaceId>
```

### Change a member's role

```http
POST /api/workspace/:workspaceId/change-role
```

Required permission:

```text
EDIT / WORKSPACE
```

Request body:

```json
{
  "userId": "<user id>",
  "roleId": "000000000000000000000002"
}
```

Behavior:

1. Verifies that the requested workspace role exists.
2. Updates the active membership record.
3. Emits a `CHANGE_USER_ROLE` activity event containing the target email and
   new role.

Changing a workspace role does not currently change the user's roles on
existing documents.

### Remove a workspace member

```http
DELETE /api/workspace/:workspaceId/members/:userId
```

Required permission:

```text
EDIT / WORKSPACE
```

The service prevents:

- Removing a user who is not an active workspace member.
- Removing the authenticated user from their own request.
- Removing the last active Admin.

When removal is allowed:

1. The membership is soft-deleted.
2. `memberCount` is decremented.
3. A `REMOVE_USER` activity event is emitted.

Member removal does not currently remove or soft-delete the user's
document-level memberships.

### Invite a member

```http
POST /api/workspace/:workspaceId/invite
```

Required permission:

```text
INVITE / MEMBER
```

Request body:

```json
{
  "email": "member@example.com",
  "roleId": "000000000000000000000002"
}
```

The service verifies that the workspace and requested role exist, then chooses
one of two invitation flows.

#### Existing verified user

If the email belongs to a verified user:

1. The service rejects the request when the user is already an active member.
2. An old soft-deleted membership is restored, or a new membership is created.
3. The workspace `memberCount` is incremented.
4. An email containing the workspace URL is sent.
5. `workspace.member.added` is emitted.
6. An `INVITE_USER` activity event is emitted.

The user can access the workspace immediately.

#### New or unverified user

If the email does not belong to a verified user:

1. The service rejects an existing, unexpired pending invitation for the same
   email and workspace.
2. A `WorkspaceInvitation` record is created.
3. An invitation email containing the workspace URL is sent.
4. An `INVITE_USER` activity event is emitted.

The invitation remains pending until the user completes registration and
email verification.

## Invitation Lifecycle

Workspace invitations have these statuses:

```text
PENDING
ACCEPTED
EXPIRED
```

An invitation expires seven days after creation.

### Registration lookup

`findPendingInvitationForRegistration()` is an internal service method used by
the authentication module.

It searches for an unexpired pending invitation matching:

- The normalized registration email.
- The workspace ID extracted from the validated internal redirect.

It returns the invitation ID and canonical redirect:

```ts
{
  invitationId: Types.ObjectId;
  redirectTo: `/workspaces/${workspaceId}`;
}
```

### Acceptance after email verification

`acceptInvitationAfterEmailVerified()` is called by the authentication module
using invitation context stored on the verification-token record.

Possible results:

| Status | Meaning |
| --- | --- |
| `accepted` | The invitation is valid and an active membership exists |
| `expired` | The invitation has expired |
| `processed` | Another request processed it, or its final state is inconsistent |
| `unavailable` | The invitation or workspace cannot be used |

Acceptance behavior:

1. Verifies the invitation ID and invited email.
2. Marks expired pending invitations as `EXPIRED`.
3. Confirms that the workspace still exists and is active.
4. Claims a pending invitation with a conditional status update.
5. Creates, restores, or reuses the workspace membership.
6. Rolls the invitation back to `PENDING` if membership creation throws.
7. Recalculates `memberCount` from active membership records.
8. Returns the workspace redirect.

The conditional invitation update and membership checks make this flow
idempotent under repeated verification requests.

## Document Access Integration

The module emits:

```text
workspace.member.added
```

Payload:

```ts
{
  workspaceId: string;
  userId: string;
}
```

The document module listens for this event and upserts an Editor membership for
the user on every active document in the workspace.

The event is emitted when:

- A workspace is created.
- An existing verified user is added directly.
- Auth verification accepts an invitation and creates a new workspace member.

## Activity Log Integration

Workspace operations emit the shared `activity.log` event.

| Operation | Activity action |
| --- | --- |
| Create workspace | `WORKSPACE_CREATION` |
| Update workspace settings | `UPDATE_SETTINGS` |
| Invite or directly add user | `INVITE_USER` |
| Change member role | `CHANGE_USER_ROLE` |
| Remove member | `REMOVE_USER` |

Activity logging is asynchronous. Logging failures are written to the console
without failing the original workspace request.

## Persistence

### Workspace collection

Collection:

```text
workspaces
```

| Field | Description |
| --- | --- |
| `name` | Required workspace name, maximum 60 characters |
| `description` | Optional description, maximum 255 characters |
| `memberCount` | Stored count of active members |
| `isDeleted` | Soft-deletion flag |
| `deletedAt` | Soft-deletion timestamp |
| `deletedBy` | User who deleted the workspace |
| `created_at` | Creation timestamp |
| `updated_at` | Update timestamp |

Indexes exist for workspace name and descending creation time.

### Workspace member collection

Collection:

```text
workspace_members
```

| Field | Description |
| --- | --- |
| `workspaceId` | Workspace reference |
| `userId` | User reference |
| `roleId` | Workspace role reference |
| `joinedAt` | Membership creation or restoration time |
| `workspaceName` | Denormalized workspace name |
| `workspaceDescription` | Denormalized workspace description |
| `isDeleted` | Soft-deletion flag |
| `deletedAt` | Soft-deletion timestamp |
| `deletedBy` | User who removed the membership |

An active user can have only one membership per workspace. The unique index is
partial and applies when `isDeleted` is `false`.

Additional indexes support lookup by user, deletion state, workspace, and
role.

### Workspace role collection

Collection:

```text
workspace_roles
```

Each role contains:

- A unique name.
- A description.
- At least one action/resource permission pair.

Roles are seeded during application startup.

### Workspace invitation collection

Collection:

```text
workspace_invitations
```

| Field | Description |
| --- | --- |
| `email` | Normalized invited email |
| `workspaceId` | Target workspace |
| `roleId` | Role assigned after acceptance |
| `inviterId` | User who sent the invitation |
| `status` | `PENDING`, `ACCEPTED`, or `EXPIRED` |
| `expiresAt` | Expiration time, seven days by default |
| `invitedAt` | Creation timestamp |

A compound index supports lookups by email, workspace, and invitation status.
Duplicate active invitations are prevented by service-level checks.

## Cache

The member-list endpoint uses:

```text
workspaceMember:<workspaceId>
```

The cached JSON response expires after two seconds.

## Configuration

The workspace module depends on:

| Environment variable | Purpose |
| --- | --- |
| `APP_URL` | Builds workspace links included in invitation emails |
| `RESEND_API_KEY` | Authenticates email delivery |
| `RESEND_FROM_EMAIL` | Invitation email sender |
| `REDIS_URL` | Provides member-list caching |
| `DATABASE_URL` | MongoDB connection |

## Current Constraints

- Workspaces and memberships are soft-deleted; there is no restore endpoint.
- Workspace deletion does not cascade to documents or invitations.
- Removing a workspace member does not revoke document-level memberships.
- Changing a workspace role does not propagate a corresponding document role.
- The member list can be stale for up to two seconds because it relies on TTL rather than explicit cache invalidation.


## Related Source Files

- [`workspace.module.ts`](../src/modules-api/workspace/workspace.module.ts)
- [`workspace.controller.ts`](../src/modules-api/workspace/workspace.controller.ts)
- [`workspace.service.ts`](../src/modules-api/workspace/workspace.service.ts)
- [`workspaces.schema.ts`](../src/modules-api/workspace/schemas/workspaces.schema.ts)
- [`workspace_members.schema.ts`](../src/modules-api/workspace/schemas/workspace_members.schema.ts)
- [`workspace-invitation.schema.ts`](../src/modules-api/workspace/schemas/workspace-invitation.schema.ts)
- [`workspace-roles.schema.ts`](../src/modules-api/workspace/schemas/workspace-roles.schema.ts)
- [`permission.guard.ts`](../src/common/guards/permission.guard.ts)
