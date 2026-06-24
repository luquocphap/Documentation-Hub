# Document Module

## Overview

The document module manages documents inside workspaces.
Its responsibilities include:

- Creating documents from metadata or Markdown content.
- Listing and reading active documents in a workspace.
- Updating document titles.
- Soft-deleting documents.
- Generating Cloudinary upload signatures.
- Processing Cloudinary upload webhooks.
- Extracting searchable document content from uploaded PDFs and Markdown.
- Managing document roles, document members, and document invitations.
- Listing and removing external document members.
- Purging expired soft-deleted document data after 30 days.
- Emitting activity-log and document-access events.

The module uses Cloudinary for
PDF file storage, Puppeteer for Markdown-to-PDF rendering, Redis for short-lived
document caching, and parser services for content extraction.

The API base path is:

```text
/api/document
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
src/modules-api/document/
|-- document.controller.ts
|-- document.module.ts
|-- document.service.ts
|-- document-purge.service.ts
|-- dto/
|   |-- change-document-role.dto.ts
|   |-- create-document.dto.ts
|   |-- create-document-markdown.dto.ts
|   |-- document-upload.dto.ts
|   |-- invite-document-member.dto.ts
|   `-- update-document.dto.ts
`-- schemas/
    |-- document-invitation.schemas.ts
    |-- document-members.schema.ts
    |-- document-roles.schema.ts
    `-- documents.schema.ts
```

`DocumentModule` registers the following MongoDB models:

- `Workspace`
- `DocumentModel`
- `DocumentMember`
- `DocumentRole`
- `WorkspaceMember`
- `DocumentInvitation`
- `User`
- `DocumentComment`
- `DocumentAnnotation`
- `CommentReply`

The module imports:

- `CloudinaryModule`
- `DocumentParserModule`

The module exports `DocumentPurgeService` because the job module runs the
scheduled document purge.

## Authentication and Authorization

Most document routes pass through the global authentication guard.

The Cloudinary webhook endpoint is public:

```http
POST /api/document/webhook/cloudinary
```

Resource-specific authorization is enforced by `PermissionGuard` on routes
decorated with `@Permissions(action, resource)`.

For a document permission check, the guard:

1. Reads `documentId` from route parameters, query parameters, or the body.
2. Validates that it is a MongoDB ObjectId.
3. Finds the authenticated user's active `DocumentMember` record.
4. Loads the member's `DocumentRole`.
5. Confirms that the role contains the required action and resource.

Workspace-scoped document listing uses `VIEW / WORKSPACE` and therefore checks
the user's active workspace membership.

## Document Roles

Roles are seeded with stable IDs.

### Owner

Permissions:

| Action          | Resource   |
| --------------- | ---------- |
| `VIEW`          | `DOCUMENT` |
| `EDIT`          | `DOCUMENT` |
| `DELETE`        | `DOCUMENT` |
| `SHARE`         | `DOCUMENT` |
| `COMMENT`       | `DOCUMENT` |
| `MANAGE_ACCESS` | `DOCUMENT` |

### Editor

Permissions:

| Action | Resource   |
| ------ | ---------- |
| `VIEW` | `DOCUMENT` |
| `EDIT` | `DOCUMENT` |

### Commenter

Permissions:

| Action    | Resource   |
| --------- | ---------- |
| `VIEW`    | `DOCUMENT` |
| `COMMENT` | `DOCUMENT` |

### Viewer

Permissions:

| Action | Resource   |
| ------ | ---------- |
| `VIEW` | `DOCUMENT` |

The current controller uses `MANAGE_ACCESS / DOCUMENT` for inviting users,
changing document roles, and removing external members.

## Endpoint Summary

| Method   | Endpoint                                             | Required permission        |
| -------- | ---------------------------------------------------- | -------------------------- |
| `GET`    | `/api/document/roles`                                | Authenticated user         |
| `GET`    | `/api/document?workspaceId=<id>`                     | `VIEW / WORKSPACE`         |
| `POST`   | `/api/document`                                      | `VIEW / WORKSPACE`         |
| `POST`   | `/api/document/from-markdown`                        | `VIEW / WORKSPACE`         |
| `POST`   | `/api/document/webhook/cloudinary`                   | Public                     |
| `GET`    | `/api/document/:documentId/upload-signature`         | `EDIT / DOCUMENT`          |
| `GET`    | `/api/document/:documentId/my-role`                  | Authenticated user         |
| `GET`    | `/api/document/:documentId`                          | `VIEW / DOCUMENT`          |
| `PATCH`  | `/api/document/:documentId`                          | `EDIT / DOCUMENT`          |
| `DELETE` | `/api/document/:documentId`                          | `DELETE / DOCUMENT`        |
| `POST`   | `/api/document/:documentId/invite`                   | `MANAGE_ACCESS / DOCUMENT` |
| `GET`    | `/api/document/:documentId/external-members`         | `VIEW / DOCUMENT`          |
| `DELETE` | `/api/document/:documentId/external-members/:userId` | `MANAGE_ACCESS / DOCUMENT` |
| `PATCH`  | `/api/document/:documentId/change-role`              | `MANAGE_ACCESS / DOCUMENT` |

## API Endpoints

### Get document roles

```http
GET /api/document/roles
```

Returns all document roles without their internal permission arrays.

Example response data:

```json
[
  {
    "_id": "111111111111111111111001",
    "name": "Owner",
    "description": "Full control over the document"
  },
  {
    "_id": "111111111111111111111002",
    "name": "Editor",
    "description": "Can edit document content"
  }
]
```

### List documents in a workspace

```http
GET /api/document?workspaceId=<workspace id>
```

Required permission:

```text
VIEW / WORKSPACE
```

The service loads active documents for the workspace, populates the creator's
name and ID, and sorts by `updated_at` in descending order.

Example response data:

```json
[
  {
    "id": "<document id>",
    "title": "Product Requirements",
    "ownerName": "Example User",
    "ownerId": "<user id>",
    "updatedAt": "2026-06-23T00:00:00.000Z"
  }
]
```

### Create a document

```http
POST /api/document
```

Required permission:

```text
VIEW / WORKSPACE
```

Request body:

```json
{
  "workspaceId": "<workspace id>",
  "title": "Product Requirements"
}
```

Validation:

- `workspaceId` is required and must be a MongoDB ObjectId.
- `title` is required, must be a string, and has a maximum length of 255
  characters.

Behavior:

1. Generates a unique title inside the workspace.
2. Creates a document with empty `public_id` and empty `content`.
3. Creates an Owner `DocumentMember` record for the creator.
4. Emits `document.created`.
5. Emits a `CREATE_DOCUMENT` activity event.

The document file itself is uploaded later through the Cloudinary signature and
webhook flow.

### Create a document from Markdown

```http
POST /api/document/from-markdown
```

Required permission:

```text
VIEW / WORKSPACE
```

Request body:

```json
{
  "workspaceId": "<workspace id>",
  "title": "API Guide",
  "markdownContent": "# API Guide\n\nContent..."
}
```

Validation:

- `workspaceId` is required and must be a MongoDB ObjectId.
- `title` is required, must be a string, and has a maximum length of 255
  characters.
- `markdownContent` is required and must be a string.

Behavior:

1. Generates a unique title inside the workspace.
2. Converts Markdown to HTML.
3. Renders the HTML to PDF with `PdfService`.
4. Uploads the generated PDF to Cloudinary server-side.
5. Creates a document with the returned Cloudinary `public_id`.
6. Creates an Owner `DocumentMember` record for the creator.
7. Emits `document.created`.
8. Emits `document.content.extract.markdown`.
9. Emits a `CREATE_DOCUMENT` activity event.

### Get an upload signature

```http
GET /api/document/:documentId/upload-signature
```

Required permission:

```text
EDIT / DOCUMENT
```

The service verifies that the document is active and returns the signed
Cloudinary upload parameters.

The signature embeds:

- `documentId`
- `userId`
- Cloudinary folder
- Cloudinary notification URL

The notification URL points back to:

```text
<BACKEND_URL>/api/document/webhook/cloudinary
```

### Cloudinary upload webhook

```http
POST /api/document/webhook/cloudinary
```

Access:

```text
Public
```

The webhook only processes Cloudinary `upload` notifications.

Behavior:

1. Reads `documentId`, `userId`, and `public_id` from the Cloudinary payload.
2. Loads the active document.
3. Deletes the previous Cloudinary file when the document already had a
   `public_id`.
4. Stores the new `public_id`.
5. Sets `updatedAt` and `updatedBy` if exists previous `public_id`.
6. Emits `UPDATE_DOCUMENT` only when replacing an existing file.
7. Emits `document.content.extract.pdf`.

Non-upload notifications return an ignored message.

### Get current user's document role

```http
GET /api/document/:documentId/my-role
```

The endpoint is authenticated. It does not use `@Permissions`, but the service
requires an active `DocumentMember` record for the authenticated user.

Example response data:

```json
{
  "role": "Owner"
}
```

### Get document details

```http
GET /api/document/:documentId
```

Required permission:

```text
VIEW / DOCUMENT
```

The result is cached in Redis for two seconds:

```text
document:<documentId>
```

Example response data:

```json
{
  "_id": "<document id>",
  "workspaceId": "<workspace id>",
  "title": "Product Requirements",
  "public_id": "<cloudinary public id>",
  "createdAt": "2026-06-23T00:00:00.000Z",
  "updatedAt": "2026-06-23T00:00:00.000Z"
}
```

### Update a document

```http
PATCH /api/document/:documentId
```

Required permission:

```text
EDIT / DOCUMENT
```

Request body:

```json
{
  "title": "Product Requirements v2"
}
```

Behavior:

1. Loads the active document.
2. If the title changed, generates a unique title inside the workspace.
3. Sets `updatedBy`.
4. Saves the document.
5. Emits an `UPDATE_DOCUMENT` activity event.

### Delete a document

```http
DELETE /api/document/:documentId
```

Required permission:

```text
DELETE / DOCUMENT
```

Deletion is soft:

- `isDeleted` is set to `true`.
- `deletedAt` is set to the current time.
- `deletedBy` is set to the authenticated user.

The service emits a `DELETE_DOCUMENT` activity event.

The hard delete of the document and its related data is handled later by the
auto-purge job.

### Invite a document member

```http
POST /api/document/:documentId/invite
```

Required permission:

```text
MANAGE_ACCESS / DOCUMENT
```

Request body:

```json
{
  "email": "member@example.com",
  "roleId": "111111111111111111111002"
}
```

The service verifies that the document and requested role exist, then chooses
one of two flows.

#### Existing verified user

If the email belongs to a verified user:

1. The service rejects the request when the user already has active document
   access.
2. An old soft-deleted document membership is restored, or a new membership is
   created.
3. An email containing the document URL is sent.
4. A `SHARE_DOCUMENT` activity event is emitted.

The user can access the document immediately.

#### New or unverified user

If the email does not belong to a verified user:

1. The service rejects an existing, unexpired pending invitation for the same
   email and document.
2. A `DocumentInvitation` record is created.
3. An invitation email containing the document URL is sent.
4. A `SHARE_DOCUMENT` activity event is emitted.

The invitation remains pending until the user completes registration and email
verification.

### List external document members

```http
GET /api/document/:documentId/external-members
```

Required permission:

```text
VIEW / DOCUMENT
```

External members are active document members who are not active members of the
document's workspace.

Example response data:

```json
[
  {
    "userId": "<user id>",
    "fullName": "External User",
    "email": "external@example.com",
    "roleId": "111111111111111111111004",
    "roleName": "Viewer"
  }
]
```

### Remove an external document member

```http
DELETE /api/document/:documentId/external-members/:userId
```

Required permission:

```text
MANAGE_ACCESS / DOCUMENT
```

The service only removes true external members.

It rejects the request when:

- The document is missing or deleted.
- The target user is not an active document member.
- The target user is also an active member of the document's workspace.

When removal succeeds:

1. The target `DocumentMember` is soft-deleted by setting `isDeleted`.
2. A `REVOKE_ACCESS` activity event is emitted.

### Change a document member role

```http
PATCH /api/document/:documentId/change-role
```

Required permission:

```text
MANAGE_ACCESS / DOCUMENT
```

Request body:

```json
{
  "userId": "<user id>",
  "roleId": "111111111111111111111004"
}
```

Behavior:

1. Verifies that the requested document role exists.
2. Updates the active `DocumentMember` record for the target user.
3. Returns a localized success message.

## Invitation Lifecycle

Document invitations have these statuses:

```text
PENDING
ACCEPTED
EXPIRED
CANCELED
```

An invitation expires seven days after creation.

`CANCELED` is used when the containing workspace is deleted. Pending document
invitations for documents in that workspace are kept as records with a final
status instead of being soft-deleted.

### Acceptance after email verification

The document module listens for:

```text
user.email.verified
```

Payload:

```ts
{
  email: string;
  userId: string;
}
```

When the event is received, the service:

1. Finds unexpired pending invitations for the verified email.
2. Creates a `DocumentMember` record when no membership record exists for that
   document and user.
3. Marks each processed invitation as `ACCEPTED`.

Canceled and expired invitations are not accepted by this listener.

## Supporting Mechanisms

### Unique title generation

Document titles are unique per active workspace document list at service level.

When a title already exists, the service tries:

```text
<title> (1)
<title> (2)
...
```

This logic runs during normal document creation, Markdown document creation,
and title updates.

### Cloudinary upload flow

Regular document creation creates only the database record.

File upload is a two-step flow:

1. The client requests an upload signature from the document API.
2. The client uploads the PDF directly to Cloudinary.
3. Cloudinary calls the public webhook with the upload result.
4. The webhook stores `public_id` and emits PDF content extraction.

When a new upload replaces an existing file, the previous Cloudinary asset is
deleted before the new `public_id` is stored.

### Content extraction

The document module stores normalized searchable content in the `content`
field.

PDF extraction:

- Triggered by `document.content.extract.pdf`.
- Downloads the uploaded PDF from Cloudinary.
- Parses it through `DocumentContentExtractorService`.
- Normalizes whitespace.
- Truncates content to 10,000 characters.
- Saves content only when the document is still active.

Markdown extraction:

- Triggered by `document.content.extract.markdown`.
- Parses Markdown to plain text.
- Normalizes whitespace.
- Truncates content to 10,000 characters.
- Saves content only when the document is still active.

Content extraction failures are logged and do not fail the original upload or
document creation request.

### Document access propagation

The module listens for:

```text
document.created
workspace.member.added
```

On `document.created`, the service grants document access to active workspace
members other than the creator:

- Workspace Admin becomes document Owner.
- Workspace members become document Editor.

On `workspace.member.added`, the service re-reads the active
`WorkspaceMember` record before assigning document access. Workspace admins are
mapped to document Owner, while regular workspace members are mapped to
document Editor. Existing soft-deleted memberships are restored with the mapped
role, missing memberships are inserted with that role, and active memberships
keep their current role.

WorkspaceService also performs direct document-access synchronization for
member add, invitation acceptance, and workspace role changes.

### Auto purge

Document deletion is soft at request time. Hard deletion is handled by
`DocumentPurgeService`.

The scheduled job runs daily at midnight in the `Asia/Ho_Chi_Minh` timezone.

The purge scans documents where:

```text
isDeleted = true
deletedAt <= now - 30 days
```

For each eligible document, the purge:

1. Deletes the Cloudinary file when `public_id` exists.
2. Deletes comment replies for the document's comments.
3. Deletes document comments.
4. Deletes document annotations.
5. Deletes document members.
6. Deletes document invitations.
7. Deletes the document record.
8. Deletes the `document:<documentId>` Redis cache key.

Cloudinary deletion failure prevents database purge for that document in the
current run. Database failures are recorded in the purge summary and logged by
the job service.

### Activity logging

Document operations emit the shared `activity.log` event.

Activity logging is asynchronous. Logging failures are written to the console
without failing the original document request.

## Activity Log Integration

| Operation                       | Activity action   |
| ------------------------------- | ----------------- |
| Create document                 | `CREATE_DOCUMENT` |
| Update title                    | `UPDATE_DOCUMENT` |
| Replace uploaded file           | `UPDATE_DOCUMENT` |
| Delete document                 | `DELETE_DOCUMENT` |
| Share or invite document access | `SHARE_DOCUMENT`  |
| Remove external document access | `REVOKE_ACCESS`   |

## Persistence

### Document collection

Collection:

```text
documents
```

| Field         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `workspaceId` | Workspace reference                                      |
| `title`       | Document title, maximum 255 characters                   |
| `public_id`   | Cloudinary public ID                                     |
| `content`     | Normalized searchable content, maximum 10,000 characters |
| `createdBy`   | Creator user reference                                   |
| `updatedBy`   | Last updater user reference                              |
| `updatedAt`   | Last manual or upload update timestamp                   |
| `isDeleted`   | Soft-deletion flag                                       |
| `deletedAt`   | Soft-deletion timestamp                                  |
| `deletedBy`   | User who deleted the document                            |
| `created_at`  | Creation timestamp                                       |
| `updated_at`  | Mongoose update timestamp                                |

Indexes support active workspace document lists and purge scans:

- `{ workspaceId: 1, isDeleted: 1, created_at: -1 }`
- `{ isDeleted: 1, deletedAt: 1 }`

### Document member collection

Collection:

```text
document_members
```

| Field        | Description                             |
| ------------ | --------------------------------------- |
| `documentId` | Document reference                      |
| `userId`     | User reference                          |
| `roleId`     | Document role reference                 |
| `joinedAt`   | Membership creation or restoration time |
| `isDeleted`  | Soft-deletion flag                      |

An active user can have only one membership per document. The unique index is
partial and applies when `isDeleted` is `false`.

### Document role collection

Collection:

```text
document_roles
```

Each role contains:

- A unique name.
- A description.
- At least one action/resource permission pair.

Roles are seeded during application startup.

### Document invitation collection

Collection:

```text
document_invitations
```

| Field        | Description                                     |
| ------------ | ----------------------------------------------- |
| `email`      | Normalized invited email                        |
| `documentId` | Target document                                 |
| `roleId`     | Role assigned after acceptance                  |
| `inviterId`  | User who sent the invitation                    |
| `status`     | `PENDING`, `ACCEPTED`, `EXPIRED`, or `CANCELED` |
| `expiresAt`  | Expiration time, seven days by default          |
| `invitedAt`  | Creation timestamp                              |

A compound index supports lookups by email, document, and invitation status.
Another index supports document/status scans for cancellation.
Duplicate active invitations are prevented by service-level checks.

## Cache

Document details use:

```text
document:<documentId>
```

The cached JSON response expires after two seconds.

The service invalidates this key after title updates, upload webhook updates,
and document soft deletion.

The purge service deletes this key when an expired soft-deleted document is
hard-deleted. Workspace deletion also invalidates document caches for documents
that were hard-deleted with the workspace.

## Configuration

The document module depends on:

| Environment variable    | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `APP_URL`               | Builds document links included in invitation emails |
| `BACKEND_URL`           | Builds the Cloudinary webhook notification URL      |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                               |
| `CLOUDINARY_API_KEY`    | Cloudinary upload API key                           |
| `CLOUDINARY_API_SECRET` | Signs Cloudinary upload parameters                  |
| `CLOUDINARY_FOLDER`     | Cloudinary target folder                            |
| `RESEND_API_KEY`        | Authenticates email delivery                        |
| `RESEND_FROM_EMAIL`     | Invitation email sender                             |
| `REDIS_URL`             | Provides document-detail caching                    |
| `DATABASE_URL`          | MongoDB connection                                  |

## Current Constraints

- Document invitations that pass `expiresAt` are ignored by acceptance lookup,
  but the document module does not currently mark them as `EXPIRED` (not critical).

## Related Source Files

- [`document.module.ts`](../src/modules-api/document/document.module.ts)
- [`document.controller.ts`](../src/modules-api/document/document.controller.ts)
- [`document.service.ts`](../src/modules-api/document/document.service.ts)
- [`document-purge.service.ts`](../src/modules-api/document/document-purge.service.ts)
- [`documents.schema.ts`](../src/modules-api/document/schemas/documents.schema.ts)
- [`document-members.schema.ts`](../src/modules-api/document/schemas/document-members.schema.ts)
- [`document-invitation.schemas.ts`](../src/modules-api/document/schemas/document-invitation.schemas.ts)
- [`document-roles.schema.ts`](../src/modules-api/document/schemas/document-roles.schema.ts)
- [`document-role.seed.ts`](../src/common/seeds/document-role.seed.ts)
- [`permission.guard.ts`](../src/common/guards/permission.guard.ts)
- [`cloudinary.service.ts`](../src/modules-system/cloudinary/cloudinary.service.ts)
- [`document-content-extractor.service.ts`](../src/modules-system/document-parser/document-content-extractor.service.ts)
- [`job.service.ts`](../src/modules-system/job/job.service.ts)
