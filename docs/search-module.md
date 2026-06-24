# Search Module

## Overview

The search module lets an authenticated user search documents they have
access to. Its responsibilities include:

- Matching a keyword against document title and content.
- Restricting results to documents the user is an active member of.
- Filtering by workspace, and by an updated-at date range.
- Paginating results.
- Reporting which field matched (title or content) and returning a
  keyword-centered content preview.

The API base path is:

```text
/api/search
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
src/modules-api/search/
|-- search.controller.ts
|-- search.module.ts
`-- search.service.ts
```

`SearchModule` registers the following MongoDB models:

- `DocumentModel`
- `DocumentMember`
- `User`

The shared query-building logic lives outside the module, in:

```text
src/common/helpers/build-query-documents.helper.ts
```

## Authentication and Authorization

Every route
first passes through the global authentication guard, which resolves the
current user via the `@CurrentUser()` decorator.

Authorization is enforced implicitly rather than through `@Permissions()`:
the service only searches within the set of document IDs for which the
authenticated user has an active `DocumentMember` record.

## Endpoint Summary

| Method | Endpoint         | Required permission |
| ------ | ---------------- | -------------------- |
| `GET`  | `/api/search/document` | Authenticated user   |

## API Endpoints

### Search accessible documents

```http
GET /api/search/document
```

Query parameters:

| Parameter      | Type   | Description                                              |
| -------------- | ------ | ---------------------------------------------------------- |
| `search`       | string | Keyword matched against document title and content         |
| `workspaceIds` | string | Comma-separated workspace IDs                              |
| `updatedFrom`  | string | Filter documents updated from this date (inclusive)        |
| `updatedTo`    | string | Filter documents updated to this date (inclusive)          |
| `page`         | number | Page number, minimum `1`, defaults to `1`                  |
| `pageSize`     | number | Page size, defaults to `20`, capped at `50`                |

All parameters are optional.

Behavior:

1. `buildQueryDocuments()` parses pagination, builds the Mongo `filter` and
   `sort`, and resolves the keyword.
2. The service loads the user's accessible document IDs from
   `DocumentMember`, restricted to records where `isDeleted` is not `true`.
3. If the user has no accessible documents, the service returns an empty
   `items` array without querying the document collection.
4. Otherwise, the filter built by the helper is combined with
   `_id: { $in: accessibleDocumentIds }`, and the service runs a count and a
   paginated find in parallel.
5. Each matched document is populated with `createdBy` (`fullName`, `email`)
   and `workspaceId` (`name`), then mapped to the response shape below.

Example response data:

```json
{
  "items": [
    {
      "id": "<document id>",
      "title": "Service Agreement",
      "workspaceId": "<workspace id>",
      "workspaceName": "Product Team",
      "public_id": "abc123",
      "ownerId": "<user id>",
      "ownerName": "Example User",
      "ownerEmail": "user@example.com",
      "contentPreview": "...renewed automatically unless either party provides a 30-day written notice of contract termination prior to...",
      "matchedField": "content",
      "updatedAt": "2026-06-23T00:00:00.000Z",
      "createdAt": "2026-06-01T00:00:00.000Z"
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

`ownerName` falls back to `"Unknown"` and `ownerId` falls back to the raw
`createdBy` value when the populated user cannot be resolved.

## Query Building

`buildQueryDocuments()` is shared with other document-listing endpoints. For
search, it builds:

- A base filter of `{ isDeleted: false }`.
- An `$or` filter on `title` and `content` using a case-insensitive regex,
  when `search` is provided. The keyword is regex-escaped before use.
- A `workspaceId: { $in: [...] }` filter from `workspaceIds`, accepting only
  valid ObjectId strings.
- An `updated_at` range filter from `updatedFrom` and `updatedTo`, each parsed
  with `new Date()` and ignored if invalid.
- A fixed sort of `updated_at` descending.
- Pagination values: `page` defaults to `1` and is clamped to a minimum of
  `1`; `pageSize` defaults to `20` and is clamped between `1` and `50`.

The same `search` keyword is also read independently by the service, via
`getSearchKeyword()`, so it can be reused for match detection and preview
generation after the database query has already filtered by it.

## Matched Field and Content Preview

For each result, the service determines `matchedField` and builds
`contentPreview`:

- `getMatchedField()` checks `content` for a case-insensitive match first,
  then `title`. It returns `'content'`, `'title'`, or `null` when there is no
  keyword.
- `buildContentPreview()` returns the document content trimmed to a target
  length of 150 characters when there is no keyword match. When there is a
  match, it centers the preview window around the matched keyword:
  1. Computes a window of at least 150 characters (or the keyword length,
     if longer) and centers it on the match.
  2. Adjusts the window to stay within the content bounds.
  3. Expands the window outward to the nearest word boundary, without
     cutting into the matched keyword itself.
  4. Prefixes `...` when the preview does not start at the beginning of the
     content, and suffixes `...` when it does not reach the end.
- `findKeywordIndex()` performs a case-insensitive `indexOf` and is reused by
  both the matching and preview logic.

This means `matchedField` and `contentPreview` are computed from the raw
keyword text on the already-fetched page of results, not from the Mongo
regex match itself.

## Pagination

`buildPagination()` derives:

```text
totalPages = ceil(total / pageSize)
hasNextPage = page < totalPages
hasPreviousPage = page > 1 && totalPages > 0
```

When the user has no accessible documents, pagination is still returned with
`total: 0` and the requested `page` / `pageSize`.

## Persistence

The search module does not own any schema. It reads from collections owned
by other modules:

| Collection         | Used for                                                          |
| ------------------ | ------------------------------------------------------------------ |
| `documents`         | Title, content, workspace, owner, and timestamp fields            |
| `document_members`   | Resolving which documents the requesting user can access          |
| `users`             | Populating `createdBy` into owner name and email                  |

Search relies on the same `isDeleted` soft-deletion convention used
elsewhere: deleted documents are excluded by the base filter, and deleted
document memberships are excluded when resolving accessible document IDs.

## Current Constraints

- Search does not use a text or full-text index; title and content matching
  is done with a regex `$or` filter, which does not scale as well as a
  dedicated text index for large content fields.

## Related Source Files

- [`search.module.ts`](../src/modules-api/search/search.module.ts)
- [`search.controller.ts`](../src/modules-api/search/search.controller.ts)
- [`search.service.ts`](../src/modules-api/search/search.service.ts)
- [`build-query-documents.helper.ts`](../src/common/helpers/build-query-documents.helper.ts)