# Comment Module

## Overview

The comment module manages PDF/document comments, annotation metadata, and
comment replies.

Its responsibilities include:

- Listing active comments for a document.
- Creating comments with either a new annotation or an existing annotation
  reference.
- Updating comment text, status, and annotation metadata.
- Soft-deleting comments and their annotations.
- Creating, listing, updating, and soft-deleting replies.
- Maintaining each root comment's `replyCount`.
- Emitting realtime comment and reply summary events to document socket rooms.

The module is implemented with NestJS, MongoDB, and the shared Socket.IO
gateway.

The API base path is:

```text
/api/comment
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
src/modules-api/comment/
|-- comment.controller.ts
|-- comment.module.ts
|-- comment.service.ts
|-- comment.service.spec.ts
|-- dto/
|   |-- comment-reply.dto.ts
|   |-- create-document-comment.dto.ts
|   `-- update-document-comment.dto.ts
|-- schemas/
|   |-- comment-replies.schema.ts
|   |-- document-annotations.schema.ts
|   `-- document-comments.schema.ts
`-- types/
    `-- comment-realtime.types.ts
```

`CommentModule` registers the following MongoDB models:

- `DocumentComment`
- `DocumentAnnotation`
- `CommentReply`

The module imports:

- `SocketModule`

The module does not currently export providers.

## Authentication and Authorization

Comment routes pass through the global authentication guard.

The comment controller does not currently use `@Permissions(...)` decorators.
As implemented, HTTP authorization is therefore based on:

- A valid authenticated user for every endpoint.
- Service-level ownership checks for updating or deleting comments.
- Service-level ownership checks for updating or deleting replies.

Creating or listing comments does not currently perform a service-level document
membership check. Realtime delivery is stricter: clients must join a document
socket room, and the socket gateway only allows joining when the user has an
active `DocumentMember` role with `VIEW / DOCUMENT`.

Owner-only checks are enforced by `CommentService.assertOwner(...)`. If the
authenticated user is not the owner of the target comment or reply, the service
throws `BadRequestException`.

## Endpoint Summary

| Method   | Endpoint                                 | Access in current code |
| -------- | ---------------------------------------- | ---------------------- |
| `GET`    | `/api/comment/:documentId`               | Authenticated user     |
| `POST`   | `/api/comment`                           | Authenticated user     |
| `PATCH`  | `/api/comment/:id`                       | Comment owner          |
| `DELETE` | `/api/comment/:id`                       | Comment owner          |
| `GET`    | `/api/comment/:id/replies`               | Authenticated user     |
| `POST`   | `/api/comment/:id/reply`                 | Authenticated user     |
| `PATCH`  | `/api/comment/:commentId/reply/:replyId` | Reply owner            |
| `DELETE` | `/api/comment/:commentId/reply/:replyId` | Reply owner            |

All route parameters that represent MongoDB IDs are validated with
`ParseMongoIdPipe`.

## API Endpoints

### List comments by document

```http
GET /api/comment/:documentId
```

Returns active comments for one document.

Behavior:

1. Finds comments with `documentId` and `isDeleted: false`.
2. Populates `annotationRef`.
3. Populates `owner.fullName`.
4. Sorts by `created_at` descending.

Example response data:

```json
[
  {
    "_id": "667000000000000000000001",
    "documentId": "666000000000000000000001",
    "text": "This clause needs a source.",
    "selectedText": "This agreement shall...",
    "pageNumber": 1,
    "status": "OPEN",
    "replyCount": 2,
    "annotationRef": {
      "_id": "668000000000000000000001",
      "annotationId": "annotation-1734259200000",
      "type": "HIGHLIGHT"
    },
    "annotationId": "annotation-1734259200000",
    "owner": {
      "_id": "665000000000000000000001",
      "fullName": "Comment Owner"
    },
    "isDeleted": false,
    "isUpdated": false,
    "created_at": "2026-06-24T04:00:00.000Z",
    "updated_at": "2026-06-24T04:00:00.000Z"
  }
]
```

### Create a comment

```http
POST /api/comment
```

Request body:

```json
{
  "documentId": "666000000000000000000001",
  "text": "This clause needs a source.",
  "selectedText": "This agreement shall...",
  "pageNumber": 1,
  "annotationId": "annotation-1734259200000",
  "annotation": {
    "annotationId": "annotation-1734259200000",
    "type": "HIGHLIGHT",
    "pageNumber": 1,
    "quads": [
      {
        "x1": 120,
        "y1": 240,
        "x2": 360,
        "y2": 240,
        "x3": 120,
        "y3": 260,
        "x4": 360,
        "y4": 260
      }
    ],
    "rect": {
      "x": 120,
      "y": 240,
      "width": 240,
      "height": 20
    },
    "contents": "Important section",
    "color": "#FFEB3B",
    "opacity": 0.8,
    "xfdf": "<xfdf>...</xfdf>"
  }
}
```

Validation:

- `documentId` is required and must be a valid MongoDB ObjectId.
- `text` is required and has a maximum length of 5000 characters.
- `selectedText` is optional.
- `pageNumber` is required and must be at least `1`.
- `status` is optional and must be `OPEN` or `RESOLVED`.
- `annotationRef` is optional and must be a MongoDB ObjectId.
- `annotationId` is optional.
- `annotation` is optional and follows the annotation DTO shape.

Behavior:

1. If `annotation` is provided, creates a new `DocumentAnnotation` for the same
   `documentId` and current user.
2. If `annotation` is not provided but `annotationRef` is provided, stores the
   existing annotation reference on the comment.
3. Creates a `DocumentComment` owned by the current user.
4. Reloads the saved comment with `annotationRef` and `owner.fullName`.
5. Emits `comment:created` to the `document:<documentId>` socket room.
6. Returns the realtime comment payload.

If realtime emission fails, the error is logged and the HTTP operation still
succeeds.

Example response data:

```json
{
  "_id": "667000000000000000000001",
  "documentId": "666000000000000000000001",
  "text": "This clause needs a source.",
  "selectedText": "This agreement shall...",
  "pageNumber": 1,
  "status": "OPEN",
  "replyCount": 0,
  "annotationRef": {
    "_id": "668000000000000000000001",
    "documentId": "666000000000000000000001",
    "annotationId": "annotation-1734259200000",
    "type": "HIGHLIGHT",
    "pageNumber": 1,
    "quads": [],
    "rect": null,
    "contents": "Important section",
    "color": "#FFEB3B",
    "opacity": 0.8,
    "xfdf": "<xfdf>...</xfdf>",
    "owner": "665000000000000000000001",
    "created_at": "2026-06-24T04:00:00.000Z",
    "updated_at": "2026-06-24T04:00:00.000Z"
  },
  "annotationId": "annotation-1734259200000",
  "owner": {
    "id": "665000000000000000000001",
    "fullName": "Comment Owner"
  },
  "created_at": "2026-06-24T04:00:00.000Z",
  "updated_at": "2026-06-24T04:00:00.000Z",
  "isUpdated": false
}
```

### Update a comment

```http
PATCH /api/comment/:id
```

Only the comment owner can update a comment.

Request body:

```json
{
  "text": "Updated comment text.",
  "status": "RESOLVED",
  "annotation": {
    "color": "#00FF00",
    "opacity": 0.5
  }
}
```

Validation:

- All create-comment fields except `annotation` are optional.
- `annotation` is optional and is a partial annotation DTO.

Behavior:

1. Loads an active comment by ID.
2. Verifies that the current user owns the comment.
3. If `annotation` is provided and the comment has `annotationRef`, updates the
   referenced annotation.
4. Applies the comment update fields.
5. Sets `isUpdated` to `true`.
6. Reloads the comment with `annotationRef` and `owner.fullName`.
7. Emits `comment:updated` to the document socket room.
8. Returns the realtime comment payload.

If the comment does not exist or is deleted, the service throws
`NotFoundException`.

### Delete a comment

```http
DELETE /api/comment/:id
```

Only the comment owner can delete a comment.

Behavior:

1. Loads an active comment by ID.
2. Verifies that the current user owns the comment.
3. Resolves the viewer-level `annotationId` from the comment or its
   `annotationRef`.
4. Soft-deletes the comment by setting `isDeleted` and `deletedAt`.
5. Soft-deletes the referenced annotation, if one exists.
6. Starts asynchronous cleanup of all replies for the comment using
   `deleteMany({ commentId })`.
7. Emits `comment:deleted` to the document socket room.

Reply cleanup failures are logged and do not fail the HTTP response.

Example response data:

```json
{
  "message": "Xoa comment thanh cong",
  "commentId": "667000000000000000000001"
}
```

### List replies for a comment

```http
GET /api/comment/:id/replies
```

Returns replies for a root comment.

Behavior:

1. Finds replies by `commentId`.
2. Populates `owner.fullName`.
3. Sorts by `created_at` ascending.

Important current behavior:

- The query does not filter out `isDeleted: true`.
- Soft-deleted replies can therefore still appear in this response.

Example response data:

```json
[
  {
    "_id": "669000000000000000000001",
    "commentId": "667000000000000000000001",
    "text": "I agree with this.",
    "owner": {
      "_id": "665000000000000000000001",
      "fullName": "Comment Owner"
    },
    "isDeleted": false,
    "isUpdated": false,
    "created_at": "2026-06-24T04:05:00.000Z",
    "updated_at": "2026-06-24T04:05:00.000Z"
  }
]
```

### Create a reply

```http
POST /api/comment/:id/reply
```

Request body:

```json
{
  "text": "I agree with this."
}
```

Validation:

- `text` is required and has a maximum length of 5000 characters.

Behavior:

1. Loads the active parent comment.
2. Creates a `CommentReply` owned by the current user.
3. Increments the parent comment's `replyCount`.
4. Emits `reply:created_summary` to the document socket room with the absolute
   updated `replyCount`.
5. Returns the saved reply with `owner.fullName` populated.

If the parent comment disappears before the `replyCount` update completes, the
service throws `NotFoundException` and does not emit the realtime summary.

Example response data:

```json
{
  "_id": "669000000000000000000001",
  "commentId": "667000000000000000000001",
  "text": "I agree with this.",
  "owner": {
    "_id": "665000000000000000000001",
    "fullName": "Comment Owner"
  },
  "isDeleted": false,
  "isUpdated": false,
  "created_at": "2026-06-24T04:05:00.000Z",
  "updated_at": "2026-06-24T04:05:00.000Z"
}
```

### Update a reply

```http
PATCH /api/comment/:commentId/reply/:replyId
```

Only the reply owner can update a reply.

Request body:

```json
{
  "text": "Updated reply text."
}
```

Behavior:

1. Verifies that the parent comment is active.
2. Finds the active reply by `_id`, `commentId`, and `isDeleted: false`.
3. Verifies that the current user owns the reply.
4. Updates `text`.
5. Sets `isUpdated` to `true`.
6. Returns the saved reply with `owner.fullName` populated.

Updating a reply does not emit a realtime event in the current service.

### Delete a reply

```http
DELETE /api/comment/:commentId/reply/:replyId
```

Only the reply owner can delete a reply.

Behavior:

1. Verifies that the parent comment is active.
2. Finds the active reply by `_id`, `commentId`, and `isDeleted: false`.
3. Verifies that the current user owns the reply.
4. Soft-deletes the reply by setting `isDeleted` and `deletedAt`.

Important current behavior:

- Deleting a reply does not decrement the parent comment's `replyCount`.
- Deleting a reply does not emit a realtime reply deletion summary.

Example response data:

```json
{
  "message": "Xoa reply thanh cong",
  "replyId": "669000000000000000000001"
}
```

## Data Model

### DocumentComment

Collection:

```text
document_comments
```

Fields:

| Field           | Type     | Notes                                      |
| --------------- | -------- | ------------------------------------------ |
| `documentId`    | ObjectId | References `DocumentModel`; indexed        |
| `text`          | string   | Required; trimmed; max length 5000         |
| `selectedText`  | string   | Optional selected PDF text                 |
| `pageNumber`    | number   | Required; minimum `1`; indexed             |
| `status`        | enum     | `OPEN` or `RESOLVED`; defaults to `OPEN`   |
| `replyCount`    | number   | Defaults to `0`                            |
| `annotationRef` | ObjectId | Optional reference to `DocumentAnnotation` |
| `annotationId`  | string   | Optional viewer-level annotation ID        |
| `owner`         | ObjectId | References `User`; required                |
| `isDeleted`     | boolean  | Soft-delete flag; defaults to `false`      |
| `deletedAt`     | Date     | Soft-delete timestamp                      |
| `isUpdated`     | boolean  | Set to `true` after edit                   |
| `created_at`    | Date     | Managed by Mongoose timestamps             |
| `updated_at`    | Date     | Managed by Mongoose timestamps             |

Indexes:

```ts
{ documentId: 1, pageNumber: 1, isDeleted: 1, created_at: -1 }
{ documentId: 1, status: 1, isDeleted: 1 }
```

### DocumentAnnotation

Collection:

```text
document_annotations
```

Fields:

| Field          | Type     | Notes                                    |
| -------------- | -------- | ---------------------------------------- |
| `documentId`   | ObjectId | References `DocumentModel`; indexed      |
| `annotationId` | string   | Viewer-level annotation ID; indexed      |
| `type`         | string   | Annotation type, for example `HIGHLIGHT` |
| `pageNumber`   | number   | Required; minimum `1`; indexed           |
| `quads`        | object[] | PDF text quad metadata                   |
| `rect`         | object   | Optional bounding rectangle              |
| `contents`     | string   | Optional annotation contents             |
| `color`        | string   | Defaults to `#FFEB3B`                    |
| `opacity`      | number   | Between `0` and `1`; defaults to `1`     |
| `xfdf`         | string   | Optional XFDF payload                    |
| `owner`        | ObjectId | References `User`; required              |
| `isDeleted`    | boolean  | Soft-delete flag; defaults to `false`    |
| `deletedAt`    | Date     | Soft-delete timestamp                    |
| `created_at`   | Date     | Managed by Mongoose timestamps           |
| `updated_at`   | Date     | Managed by Mongoose timestamps           |

Indexes:

```ts
{ documentId: 1, annotationId: 1 } // unique while isDeleted is false
{ documentId: 1, pageNumber: 1, isDeleted: 1 }
```

The unique `documentId + annotationId` index uses a partial filter expression:

```ts
{
  isDeleted: false;
}
```

This allows a deleted annotation ID to be reused later for the same document.

### CommentReply

Collection:

```text
comment_replies
```

Fields:

| Field        | Type     | Notes                                 |
| ------------ | -------- | ------------------------------------- |
| `commentId`  | ObjectId | References `DocumentComment`; indexed |
| `text`       | string   | Required; trimmed; max length 5000    |
| `owner`      | ObjectId | References `User`; required           |
| `isDeleted`  | boolean  | Soft-delete flag; defaults to `false` |
| `deletedAt`  | Date     | Soft-delete timestamp                 |
| `isUpdated`  | boolean  | Set to `true` after edit              |
| `created_at` | Date     | Managed by Mongoose timestamps        |
| `updated_at` | Date     | Managed by Mongoose timestamps        |

Indexes:

```ts
{ commentId: 1, isDeleted: 1, created_at: 1 }
```

## Comment Status

`DocumentCommentStatus` contains:

| Value      | Meaning                         |
| ---------- | ------------------------------- |
| `OPEN`     | The comment is still active     |
| `RESOLVED` | The discussion has been handled |

The service does not apply additional lifecycle rules to status changes. The
owner can update the status through the update-comment endpoint.

## Realtime Events

Comment realtime is delivered through `SocketGateway`.

Clients join a document room with:

```text
document:join
```

Payload:

```json
{
  "documentId": "666000000000000000000001"
}
```

The gateway validates:

1. `documentId` is a valid ObjectId.
2. The connected user has an active `DocumentMember` record for the document.
3. The user's document role contains `VIEW / DOCUMENT`.

The socket room name is:

```text
document:<documentId>
```

### Emitted events

| Event                   | Emitted by         | Payload                          |
| ----------------------- | ------------------ | -------------------------------- |
| `comment:created`       | `create(...)`      | `DocumentCommentRealtimePayload` |
| `comment:updated`       | `update(...)`      | `DocumentCommentRealtimePayload` |
| `comment:deleted`       | `remove(...)`      | `CommentDeletedPayload`          |
| `reply:created_summary` | `createReply(...)` | `ReplySummaryPayload`            |

`reply:deleted_summary` exists in the socket constants, but the comment service
does not emit it in the current implementation.

Realtime emit failures are caught and logged by the comment service. The HTTP
operation is not rolled back when the socket layer fails.

### DocumentCommentRealtimePayload

```json
{
  "_id": "667000000000000000000001",
  "documentId": "666000000000000000000001",
  "text": "This clause needs a source.",
  "selectedText": "This agreement shall...",
  "pageNumber": 1,
  "status": "OPEN",
  "replyCount": 0,
  "annotationRef": {
    "_id": "668000000000000000000001",
    "documentId": "666000000000000000000001",
    "annotationId": "annotation-1734259200000",
    "type": "HIGHLIGHT",
    "pageNumber": 1,
    "quads": [],
    "rect": null,
    "contents": "Important section",
    "color": "#FFEB3B",
    "opacity": 0.8,
    "xfdf": "<xfdf>...</xfdf>",
    "owner": "665000000000000000000001",
    "created_at": "2026-06-24T04:00:00.000Z",
    "updated_at": "2026-06-24T04:00:00.000Z"
  },
  "annotationId": "annotation-1734259200000",
  "owner": {
    "id": "665000000000000000000001",
    "fullName": "Comment Owner"
  },
  "created_at": "2026-06-24T04:00:00.000Z",
  "updated_at": "2026-06-24T04:00:00.000Z",
  "isUpdated": false
}
```

`annotationRef` can be:

- A full annotation object when the annotation is populated.
- A string ObjectId when only the reference is present.
- `null` when the comment has no annotation.

### CommentDeletedPayload

```json
{
  "documentId": "666000000000000000000001",
  "commentId": "667000000000000000000001",
  "annotationId": "annotation-1734259200000"
}
```

`annotationId` can be `null` when the comment has no annotation or the
annotation lookup cannot resolve a viewer-level ID.

### ReplySummaryPayload

```json
{
  "documentId": "666000000000000000000001",
  "commentId": "667000000000000000000001",
  "replyCount": 3
}
```

The `replyCount` value is the absolute count stored on the parent comment after
the reply create operation.

## Lifecycle Notes

### Comment creation

```text
Create annotation when needed
-> create comment
-> reload populated comment
-> emit comment:created
-> return realtime payload
```

The returned create response is intentionally shaped like the realtime payload
so HTTP consumers and socket consumers can use the same comment contract.

### Comment update

```text
Find active comment
-> assert owner
-> optionally update annotation
-> update comment fields
-> mark isUpdated
-> reload populated comment
-> emit comment:updated
-> return realtime payload
```

Annotation updates only run when both conditions are true:

- The request includes `annotation`.
- The comment already has `annotationRef`.

### Comment deletion

```text
Find active comment
-> assert owner
-> resolve annotationId
-> soft-delete comment
-> soft-delete annotation
-> asynchronously delete replies
-> emit comment:deleted
```

The root comment and annotation use soft delete. Replies under a deleted root
comment are removed with `deleteMany` in a fire-and-forget cleanup path.

### Reply creation

```text
Find active parent comment
-> create reply
-> increment replyCount
-> emit reply:created_summary
-> return populated reply
```

### Reply deletion

```text
Find active parent comment
-> find active reply
-> assert owner
-> soft-delete reply
```

Reply deletion does not change `replyCount` and does not emit a socket event.

## Error Behavior

Common service errors:

| Case                                             | Error type            |
| ------------------------------------------------ | --------------------- |
| Comment is missing or already deleted            | `NotFoundException`   |
| Reply is missing or already deleted              | `NotFoundException`   |
| Parent comment is missing while handling a reply | `NotFoundException`   |
| Current user is not the comment owner            | `BadRequestException` |
| Current user is not the reply owner              | `BadRequestException` |

Realtime failures and asynchronous reply-cleanup failures are logged but do not
fail the already successful HTTP operation.
