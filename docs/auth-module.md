# Authentication Module

## Overview

The authentication module is responsible for:

- User registration and email verification.
- Login, logout, and authentication cookies.
- Access-token validation and refresh-token rotation.
- Workspace-invitation-aware registration.
- Returning the authenticated user's profile.
- Searching for users who can be invited to workspaces or documents.

It is implemented with NestJS, MongoDB, Redis, JWT, bcrypt, and HTTP-only
cookies.

The API base path is:

```text
/api/auth
```

Most successful responses are wrapped by the global success interceptor:

```json
{
  "status": "Success",
  "statusCode": 200,
  "data": {}
}
```

The refresh-token endpoint writes its response directly with Express and
therefore returns its own response shape.

## Module Structure

```text
src/modules-api/auth/
├── auth.controller.ts
├── auth.module.ts
├── auth.service.ts
├── dto/
├── schemas/
└── utils/
```

Supporting components:

- `TokenModule` creates and verifies JWTs.
- `RedisService` stores the active refresh token for each user.
- `WorkspaceService` resolves and accepts workspace invitations.
- `ProtectGuard` authenticates protected HTTP endpoints.
- The verification email helper sends verification links through Resend.

`AuthModule` registers the `User`, `VerificationToken`, `WorkspaceMember`, and
`DocumentMember` MongoDB models. It imports `TokenModule` and
`WorkspaceModule`.

## Authentication Model

### Access token

- JWT payload: `{ "userId": "<MongoDB user id>" }`
- Lifetime: one minute.
- Signed with `ACCESS_TOKEN_SECRET`.
- Stored in the `accessToken` HTTP-only cookie.
- Validated by the global `ProtectGuard`.

### Refresh token

- JWT payload: `{ "userId": "<MongoDB user id>" }`
- Lifetime: one day.
- Signed with `REFRESH_TOKEN_SECRET`.
- Stored in the `refreshToken` HTTP-only cookie.
- Also stored in Redis under:

  ```text
  refresh_token:<userId>
  ```

Only one refresh token is active per user. Logging in or verifying an email
replaces the currently stored token.

Refresh-token rotation uses a Redis Lua script. The stored token is replaced
only when it exactly matches the token supplied by the client. A previously
rotated token cannot be reused.

### Authentication cookies

Both cookies use:

```ts
{
  httpOnly: true,
  secure: NODE_ENV === "production",
  sameSite: "strict",
  maxAge: refreshExpiresAt - Date.now()
}
```

The access-token cookie uses the refresh token's expiration as its cookie
`maxAge`, although the access JWT itself expires after one minute.

Clients must send requests with credentials enabled.

## Public and Protected Routes

Authentication is enforced globally by `ProtectGuard`. An endpoint is public
only when decorated with `@Public()`.

| Endpoint | Access |
| --- | --- |
| `POST /api/auth/register` | Public |
| `POST /api/auth/login` | Public |
| `POST /api/auth/resend-verification` | Public |
| `POST /api/auth/refresh-token` | Public |
| `GET /api/auth/verify-email` | Public |
| `GET /api/auth/user-info` | Protected |
| `POST /api/auth/logout` | Protected |
| `GET /api/auth/search-candidates` | Protected |

For protected HTTP routes, `ProtectGuard`:

1. Reads `accessToken` from the request cookies.
2. Verifies the JWT.
3. Loads the user from MongoDB.
4. Assigns the user document to `request.user`.

The controller obtains this value through the `@User()` decorator.

## API Endpoints

### Register

```http
POST /api/auth/register
```

Request body:

```json
{
  "email": "member@example.com",
  "password": "password123",
  "fullName": "Example Member",
  "redirectTo": "/workspaces/000000000000000000000001"
}
```

`redirectTo` is optional and may be URL encoded. It must represent an internal
workspace route.

Behavior:

1. Normalizes the email to lowercase.
2. Rejects an existing verified email address.
3. Validates an optional workspace redirect against a pending invitation.
4. Hashes the password with bcrypt using ten salt rounds.
5. Creates a user or updates an existing unverified user.
6. Invalidates older active verification tokens.
7. Creates a verification token with a one-hour lifetime.
8. Sends a verification email.

The endpoint returns `true` after registration completes.

### Resend verification email

```http
POST /api/auth/resend-verification
```

Request body:

```json
{
  "email": "member@example.com",
  "redirectTo": "/workspaces/000000000000000000000001"
}
```

The endpoint rejects unknown users and already verified users. It invalidates
older active tokens before issuing a new verification token.

When `redirectTo` is omitted, the service attempts to preserve invitation
context from the user's most recent verification-token record.

Response data:

```json
{
  "message": "success"
}
```

### Verify email

```http
GET /api/auth/verify-email?token=<verification-token>
```

Behavior:

1. Loads the verification-token record and user.
2. Rejects invalid or explicitly invalidated tokens.
3. Marks expired tokens as invalid and returns HTTP `410 Gone`.
4. Atomically marks an unused token as used.
5. Marks the user's email as verified.
6. Accepts the associated workspace invitation when present.
7. Emits integration events.
8. Creates access and refresh tokens.
9. Stores the refresh token in Redis.
10. Sets authentication cookies.

The verification flow tolerates a repeated request when the token was already
processed successfully.

Response data:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "refreshExpiresAt": "2026-06-24T00:00:00.000Z",
  "redirectTo": "/workspaces/000000000000000000000001",
  "invitationStatus": "accepted",
  "message": "<localized verification success message>"
}
```

`redirectTo` and `invitationStatus` are returned only when an invitation was
processed.

### Login

```http
POST /api/auth/login
```

Request body:

```json
{
  "email": "member@example.com",
  "password": "password123"
}
```

The service validates the password, requires a verified email, creates a token
pair, stores the refresh token in Redis, and sets both cookies.

Response data:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "refreshExpiresAt": "2026-06-24T00:00:00.000Z"
}
```

### Refresh tokens

```http
POST /api/auth/refresh-token
```

Required cookies:

```text
accessToken=<expired-or-active-access-token>
refreshToken=<active-refresh-token>
```

The access token is verified with expiration ignored. The refresh token must
still be valid.

The service verifies that both JWTs belong to the same existing user, creates
a new pair, and atomically rotates the Redis refresh token.

Response:

```json
{
  "result": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "refreshExpiresAt": "2026-06-24T00:00:00.000Z"
  }
}
```

### Get current user

```http
GET /api/auth/user-info
```

Returns the authenticated user. The schema's JSON transformation:

- Converts `_id` to `id`.
- Removes `_id`.
- Removes `passwordHash`.
- Includes virtual fields.

### Logout

```http
POST /api/auth/logout
```

Logout deletes `refresh_token:<userId>` from Redis and clears both
authentication cookies.

Response data:

```json
{
  "message": "Logout successfully"
}
```

### Search invitation candidates

```http
GET /api/auth/search-candidates?keyword=<email>&workspaceId=<id>&documentId=<id>
```

`workspaceId` and `documentId` are optional MongoDB IDs.

The endpoint:

- Searches email addresses case-insensitively.
- Returns at most 20 users.
- Adds `inWorkspace` when `workspaceId` is supplied.
- Adds `inDocument` when `documentId` is supplied.

Example response data:

```json
[
  {
    "id": "000000000000000000000001",
    "email": "member@example.com",
    "fullName": "Example Member",
    "inWorkspace": true,
    "inDocument": false
  }
]
```

## Workspace Invitation Integration

The auth module does not trust an arbitrary frontend redirect.

An accepted redirect must:

- Point to `/workspaces/<MongoDB ID>`.
- Match a pending workspace invitation for the registering email.

The invitation ID and redirect path are stored on the `VerificationToken`
record. Email verification uses this stored context before accepting the
invitation.

This prevents a caller from using `redirectTo` to join an unrelated workspace
or redirect verification to an external URL.

## Domain Events

### `user.email.verified`

Emitted when a user changes from unverified to verified:

```ts
{
  email: string;
  userId: string;
}
```

### `workspace.member.added`

Emitted when verification accepts an invitation and creates a workspace
member:

```ts
{
  workspaceId: string;
  userId: string;
}
```

The document module uses this event to grant access to existing documents in
the workspace.

## Persistence

### User collection

Collection: `User`

| Field | Description |
| --- | --- |
| `email` | Unique, normalized email address |
| `passwordHash` | Bcrypt hash, excluded from normal queries |
| `fullName` | User display name |
| `isEmailVerified` | Whether verification has completed |
| `lastAccessedWorkspaceId` | Optional last workspace reference |

### Verification token collection

Collection: `VerificationToken`

| Field | Description |
| --- | --- |
| `token` | Unique random 32-byte hex token |
| `userId` | User being verified |
| `workspaceInvitationId` | Optional stored invitation context |
| `redirectTo` | Optional validated workspace path |
| `expiresAt` | Token expiration time |
| `isUsed` | Whether verification consumed the token |
| `isValid` | Whether the token can still be used |

### Redis

Refresh tokens use:

```text
refresh_token:<userId>
```

The Redis key's TTL matches the refresh JWT expiration.

## Configuration

| Environment variable | Purpose |
| --- | --- |
| `ACCESS_TOKEN_SECRET` | Signs and verifies access JWTs |
| `REFRESH_TOKEN_SECRET` | Signs and verifies refresh JWTs |
| `REDIS_URL` | Stores active refresh tokens |
| `RESEND_API_KEY` | Sends verification emails |
| `RESEND_FROM_EMAIL` | Verification email sender |
| `APP_URL` | Frontend origin and email-link destination |
| `NODE_ENV` | Enables secure cookies in production |
| `DATABASE_URL` | MongoDB connection |

## Security Properties

- Passwords are stored as bcrypt hashes.
- Password hashes are excluded from normal queries and serialized responses.
- Authentication tokens are stored in HTTP-only cookies.
- Production cookies use the `Secure` flag.
- Cookies use `SameSite=Strict`.
- Refresh tokens are rotated atomically.
- Logout revokes server-side refresh-token state.
- Verification tokens are single-use and expire after one hour.
- A new verification email invalidates older active tokens.
- Workspace redirects are restricted to validated internal paths.

## Current Constraints

- There is no password-reset or password-change flow.
- There is no multi-device session model; each user has one active refresh
  token.
- Access tokens expire after one minute.
- Refresh tokens expire after one day.
- Login and verification responses include JWT strings in addition to setting
  HTTP-only cookies.
- Rate limiting is not implemented by this module.

## Related Source Files

- [`auth.module.ts`](../src/modules-api/auth/auth.module.ts)
- [`auth.controller.ts`](../src/modules-api/auth/auth.controller.ts)
- [`auth.service.ts`](../src/modules-api/auth/auth.service.ts)
- [`token.service.ts`](../src/modules-system/token/token.service.ts)
- [`protect.guard.ts`](../src/common/guards/protect.guard.ts)
- [`user.schema.ts`](../src/modules-api/auth/schemas/user.schema.ts)
- [`verification-token.schema.ts`](../src/modules-api/auth/schemas/verification-token.schema.ts)
