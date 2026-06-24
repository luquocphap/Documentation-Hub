# Activity Module

## Overview

The activity module records and exposes an audit trail of actions taken
inside a workspace. Its responsibilities include:

- Listening for activity-log events emitted by other modules and persisting
  them.
- Listing available actions, grouped by category.
- Listing the actors who have logged activity in a workspace.
- Listing and filtering a workspace's activity logs, with pagination.
- Broadcasting newly created activity entries over a socket gateway.

The API base path is:

```text
/api/activity
```

Successful responses are normally wrapped by the global response
interceptor:

```json
{
  "status": "Success",
  "statusCode": 200,
  "data": {}
}
```

## Module Structure

```text
src/modules-api/activity/
|-- activity.controller.ts
|-- activity.module.ts
|-- activity.service.ts
|-- types/
|   `-- activity.types.ts
`-- schemas/
    |-- action_categories.schema.ts
    |-- actions.schema.ts
    `-- activities.schema.ts
```

`ActivityModule` registers the following MongoDB models:

- `Activity`
- `Action`
- `ActionCategory`
- `User`
- `Workspace`

It imports `SocketModule` to emit realtime activity-created events.

The shared query-building logic for the log-listing endpoint lives outside
the module, in:

```text
src/common/helpers/build-query-activities.helper.ts
```

## Authentication and Authorization

Every route first passes through the global authentication guard.

`getActivityActions()` has no `@Permissions()` check; any authenticated user
can read the static action/category catalog.

`getActivityActors()` and `getActivityLogs()` are decorated with
`@Permissions('VIEW', 'WORKSPACE')`, so `PermissionGuard` requires the
authenticated user to hold an active workspace membership whose role
includes `VIEW / WORKSPACE` for the `workspaceId` route parameter.

## Endpoint Summary

| Method | Endpoint                       | Required permission |
| ------ | ------------------------------ | -------------------- |
| `GET`  | `/api/activity/actions`        | Authenticated user   |
| `GET`  | `/api/activity/:workspaceId/actors` | `VIEW / WORKSPACE` |
| `GET`  | `/api/activity/:workspaceId`   | `VIEW / WORKSPACE`   |

## API Endpoints

### Get activity actions

```http
GET /api/activity/actions
```

Returns every seeded action, grouped by category.

Behavior:

1. Loads all `ActionCategory` documents, sorted by `_id` ascending.
2. Loads all `Action` documents, sorted by `categoryId`, then `_id`
   ascending.
3. Groups actions under their category ID.
4. Returns each category with its `actions` array, defaulting to an empty
   array when a category has no actions.

Example response data:

```json
[
  {
    "id": "000000000000000000000001",
    "category": "Workspace",
    "actions": [
      {
        "id": "333333333333333333333001",
        "code": "WORKSPACE_CREATION",
        "action": "Created the workspace"
      }
    ]
  }
]
```

### Get activity actors

```http
GET /api/activity/:workspaceId/actors
```

Required permission:

```text
VIEW / WORKSPACE
```

Behavior:

1. Finds the distinct `actorId` values among the workspace's `Activity`
   records.
2. Returns an empty array immediately if there are none.
3. Loads the matching users, selecting `_id`, `fullName`, and `email`, sorted
   by `fullName` then `_id`.

Example response data:

```json
[
  {
    "id": "<user id>",
    "fullName": "Example User",
    "email": "user@example.com"
  }
]
```

This endpoint reflects who has logged activity, not who is currently a
workspace member.

### Get activity logs

```http
GET /api/activity/:workspaceId
```

Required permission:

```text
VIEW / WORKSPACE
```

Query parameters:

| Parameter     | Type   | Description                                  |
| ------------- | ------ | --------------------------------------------- |
| `actorIds`    | string | Comma-separated actor user IDs                |
| `actionIds`   | string | Comma-separated action IDs                    |
| `createdFrom` | string | Filter activities created from this date       |
| `createdTo`   | string | Filter activities created to this date         |
| `page`        | number | Page number, minimum `1`, defaults to `1`      |
| `pageSize`    | number | Page size, defaults to `20`, capped at `50`    |

All parameters are optional.

Behavior:

1. `buildQueryActivities()` parses pagination and builds the Mongo `filter`
   (actor, action, and `created_at` range) and `sort`, following the same
   conventions as the document query helper.
2. The service merges the helper's filter with `workspaceId` for the route
   parameter.
3. Count and a populated, paginated find run in parallel: `actorId`
   (`fullName`, `email`), `workspaceId` (`name`), `actionId` (`code`,
   `action`, `categoryId`).
4. Each result is mapped through `mapActivity()` into the response shape
   below.

`mapActivity()` falls back to the raw ObjectId reference for `actorId`,
`workspaceId`, or `actionId` if a populate could not resolve it, and throws
if the action code or `created_at` is missing, since either indicates
corrupted activity data.

Example response data:

```json
{
  "items": [
    {
      "id": "<activity id>",
      "actorId": "<user id>",
      "actorName": "Example User",
      "actorEmail": "user@example.com",
      "workspaceId": "<workspace id>",
      "workspaceName": "Product Team",
      "actionId": "<action id>",
      "actionCode": "INVITE_USER",
      "actionName": "Invited a member",
      "actionCategoryId": "<category id>",
      "targets": [
        {
          "type": "EMAIL",
          "value": "member@example.com",
          "entityId": "<user id>"
        }
      ],
      "createdAt": "2026-06-23T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Pagination is computed by `buildPagination()` the same way as in the other
modules: `totalPages = ceil(total / pageSize)`, `hasNextPage = page <
totalPages`, `hasPreviousPage = page > 1 && totalPages > 0`.

## Event Listeners

The service listens for one application event and reacts to it
asynchronously. Failures are logged and never thrown back to the emitter.

| Listens for           | Does                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `ACTIVITY_LOG_EVENT`   | Resolves the action ID, builds targets from the payload, persists an `Activity` document, then reloads and populates it and emits it to the workspace's socket room. Persistence and socket emission are independent: a socket failure does not undo or fail the write. |

`handleActivityLog()` is registered with `@OnEvent(ACTIVITY_LOG_EVENT, {
async: true })`, so it does not block the request that triggered the
underlying workspace or document operation.

## Activity Targets

Each activity stores up to two `ActivityTarget` entries, built by
`buildTargets()` based on the action in the event payload:

| Action(s)                                              | Targets                                  |
| -------------------------------------------------------- | ------------------------------------------ |
| `CREATE_DOCUMENT`, `UPDATE_DOCUMENT`, `DELETE_DOCUMENT`   | One `DOCUMENT` target (document name/ID)   |
| `SHARE_DOCUMENT`, `REVOKE_ACCESS`                         | One `DOCUMENT` target and one `EMAIL` target |
| `INVITE_USER`, `REMOVE_USER`                              | One `EMAIL` target                         |
| `CHANGE_USER_ROLE`                                        | One `EMAIL` target and one `ROLE` target   |
| `UPDATE_SETTINGS`, `WORKSPACE_CREATION`                   | No targets                                 |

The `EMAIL` and `ROLE` targets carry an `entityId` when the payload includes
a resolvable user or role ID; document targets always carry the document
ID. The schema enforces a maximum of two targets per activity.

## Realtime Emission

After an activity is written, the service reloads it with the same
population used for the listing endpoint, maps it to the same response
shape, and calls:

```ts
socketGateway.emitActivityCreated(workspaceId, item);
```

Clients subscribed to the workspace's socket room receive newly created
activity items without polling the listing endpoint.

## Persistence

### Activity collection

Collection:

```text
activities
```

| Field         | Description                                            |
| ------------- | -------------------------------------------------------- |
| `actorId`     | User who performed the action                            |
| `workspaceId` | Workspace the activity belongs to                         |
| `actionId`    | Reference to the `Action` that was performed              |
| `targets`     | Up to two embedded `ActivityTarget` entries                |
| `created_at`  | Creation timestamp (only timestamp tracked)                |

There is no `updated_at`; activity records are immutable once created.

Indexes support:

- `workspaceId` + `created_at` descending, for the default listing sort.
- `workspaceId` + `actorId` + `created_at` descending, for actor filtering.
- `workspaceId` + `actionId` + `created_at` descending, for action filtering.

### Action collection

Collection:

```text
actions
```

| Field        | Description                                  |
| ------------ | ----------------------------------------------- |
| `code`       | Enum value identifying the action programmatically |
| `action`     | Human-readable action label                       |
| `categoryId` | Reference to the action's `ActionCategory`        |

A unique partial index on `code` enforces one document per action code,
applying only where `code` is a string.

### Action category collection

Collection:

```text
action_categories
```

| Field  | Description           |
| ------ | ----------------------- |
| `name` | Category display name |

Actions and categories are expected to be seeded; the module does not expose
create or update endpoints for either.

## Related Source Files

- [`activity.module.ts`](../src/modules-api/activity/activity.module.ts)
- [`activity.controller.ts`](../src/modules-api/activity/activity.controller.ts)
- [`activity.service.ts`](../src/modules-api/activity/activity.service.ts)
- [`activities.schema.ts`](../src/modules-api/activity/schemas/activities.schema.ts)
- [`actions.schema.ts`](../src/modules-api/activity/schemas/actions.schema.ts)
- [`action_categories.schema.ts`](../src/modules-api/activity/schemas/action_categories.schema.ts)
- [`activity.types.ts`](../src/modules-api/activity/types/activity.types.ts)
- [`build-query-activities.helper.ts`](../src/common/helpers/build-query-activities.helper.ts)