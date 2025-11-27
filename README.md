# Strapi Audit Log Viewer Plugin

A custom Strapi 5 plugin for viewing audit logs directly from PostgreSQL partition tables. Designed for Strapi Community Edition.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Strapi](https://img.shields.io/badge/strapi-5.27-purple)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Read-only audit log viewer** in Strapi Admin Panel
- **SuperAdmin only access** with RBAC permissions
- **Direct PostgreSQL queries** - no Content Types created
- **Partition table support** - works with `audit.audit_log` partitioned by date
- **Hot view optimization** - queries `audit.audit_log_hot` (last 90 days)
- **Filtering** - by date range, action, result, actor, target
- **Pagination** - configurable page size (max 100)
- **Statistics** - 7-day summary with charts
- **CSV Export** - export filtered results
- **PII Protection** - sensitive data (ip_hash, sig) not exposed to UI
- **Dark/Light theme** compatible UI

## Requirements

- Strapi 5.x (tested with 5.27)
- PostgreSQL with `audit` schema
- Node.js >= 18.0.0

## Quick Start

### 1. Database Setup

Run the migration files in order:

```bash
# Using psql
psql -d your_database -f migrations/001_audit_schema.sql
psql -d your_database -f migrations/002_user_soft_delete.sql

# Or using pgAdmin - open each file and execute
```

This creates:
- `audit` schema
- `audit.audit_log` partitioned table (RANGE by `ts`)
- `audit.audit_log_hot` view (last 90 days)
- `audit.audit_bucket` for brute-force protection
- Required indexes (BRIN on `ts`, B-tree on action/actor/target)

### 2. Plugin Installation

```bash
# NPM
npm install strapi-plugin-audit-viewer

# Yarn
yarn add strapi-plugin-audit-viewer

# pnpm
pnpm add strapi-plugin-audit-viewer
```

### 3. Enable Plugin

Add to `config/plugins.ts` (or `.js`):

```typescript
export default ({ env }) => ({
  'audit-viewer': {
    enabled: true,
  },
  // ... other plugins
});
```

### 4. Environment Variables

Add to your `.env`:

```bash
# Audit HMAC Secret (for tamper detection)
AUDIT_HMAC_SECRET=your-secure-secret-here

# IP Hash Salt (for privacy)
AUDIT_IP_SALT=your-ip-salt-here

# Identifier Hash Salt (for email/username hashing)
AUDIT_IDENTIFIER_SALT=your-id-salt-here

# Retention period (months)
AUDIT_RETENTION_MONTHS=24
```

**Generate secure secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Build & Run

```bash
pnpm build
pnpm develop
```

---

## Strapi Integration (Audit Logging)

The plugin only **reads** audit logs. To **write** logs, you need to integrate audit logging into your Strapi application.

### Required Files

Copy the example files to your Strapi project:

```
examples/
├── request-context.ts  → src/middlewares/request-context.ts
├── audit.ts            → src/utils/audit.ts
└── strapi-server.ts    → src/extensions/users-permissions/strapi-server.ts
```

### Step 1: Request Context Middleware

Copy `examples/request-context.ts` to `src/middlewares/request-context.ts`

Then add to `config/middlewares.ts`:

```typescript
export default [
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::favicon',
  'strapi::public',
  // Add this line:
  'global::request-context',
];
```

### Step 2: Audit Utility

Copy `examples/audit.ts` to `src/utils/audit.ts`

This provides:
- `auditLoginSuccess()` - Log successful login
- `auditLoginFail()` - Log failed login (with rate limiting)
- `auditPasswordResetRequest()` - Log password reset request
- `auditPasswordResetConfirm()` - Log password reset confirmation
- `auditEmailVerify()` - Log email verification
- `auditAccountDeletion()` - Log account deletion events
- `auditProfilePublish()` - Log profile publish/unpublish
- `auditRoleChange()` - Log role changes

### Step 3: Users-Permissions Extension

Copy `examples/strapi-server.ts` to `src/extensions/users-permissions/strapi-server.ts`

This automatically logs:
- ✅ Successful logins
- ❌ Failed logins (wrong password)
- ❌ Deleted account login attempts
- ❌ Unverified account login attempts
- 🔑 Password reset requests
- 🔑 Password reset confirmations

### Step 4: Custom Audit Events

Add audit logging to your custom controllers:

```typescript
import { auditAccountDeletion, auditProfilePublish } from '../utils/audit';

// In your controller
async deleteAccount(ctx) {
  // ... deletion logic ...
  
  await auditAccountDeletion(strapi, ctx, {
    action: 'DELETE_REQUESTED',
    actorId: ctx.state.user.id,
    targetUserId: ctx.state.user.id,
    reason: 'User requested',
  });
}

async publishProfile(ctx) {
  // ... publish logic ...
  
  await auditProfilePublish(strapi, ctx, {
    actorId: ctx.state.user.id,
    targetType: 'coach',
    targetId: profileId,
    isPublish: true,
  });
}
```

---

## Directory Structure

```
audit_log_viewer/
├── README.md                           # This file
├── LICENSE                             # MIT license
├── .gitignore                          # Git ignore rules
├── plugin/                             # Strapi plugin
│   ├── package.json
│   ├── tsconfig.json
│   ├── admin/src/
│   │   ├── index.tsx                   # Admin entry point
│   │   ├── pluginId.ts
│   │   ├── pages/AuditLogPage.tsx      # Main UI component
│   │   └── translations/{en,tr}.json
│   └── server/src/
│       ├── index.ts
│       ├── bootstrap.ts                # RBAC permission registration
│       ├── routes/index.ts
│       ├── controllers/audit-viewer.ts
│       ├── services/audit-viewer.ts
│       └── policies/is-super-admin.ts
├── migrations/                         # PostgreSQL migrations
│   ├── 001_audit_schema.sql
│   └── 002_user_soft_delete.sql
├── examples/                           # Example integration files
│   ├── request-context.ts              # Middleware for request context
│   ├── audit.ts                        # Audit utility functions
│   └── strapi-server.ts                # Users-permissions extension
└── docs/
    └── AUDIT_LOG_VIEWER_PLUGIN.md      # Detailed documentation
```

---

## API Endpoints

All endpoints require SuperAdmin authentication:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit-viewer/logs` | List logs with pagination |
| GET | `/audit-viewer/logs/:id` | Get single log detail |
| GET | `/audit-viewer/actions` | Get action list for dropdown |
| GET | `/audit-viewer/stats` | Get 7-day statistics |
| GET | `/audit-viewer/export` | Export as CSV |

### Query Parameters

- `page` - Page number (default: 1)
- `pageSize` - Items per page (default: 25, max: 100)
- `from` - Start date (ISO format)
- `to` - End date (ISO format)
- `action` - Filter by action type
- `result` - Filter by result (success/fail)
- `actorId` - Filter by actor ID
- `targetType` - Filter by target type
- `targetId` - Filter by target ID
- `requestId` - Filter by request UUID

---

## Audit Actions

| Action | Description |
|--------|-------------|
| `LOGIN_SUCCESS` | Successful user login |
| `LOGIN_FAIL_BUCKETED` | Failed login (bucketed for rate limiting) |
| `PASSWORD_RESET_REQUEST` | Password reset requested |
| `PASSWORD_RESET_CONFIRM` | Password reset confirmed |
| `EMAIL_VERIFY` | Email verified |
| `PROFILE_PUBLISH` | Profile published |
| `PROFILE_UNPUBLISH` | Profile unpublished |
| `PROFILE_UPDATE_SENSITIVE` | Sensitive profile data updated |
| `ROLE_CHANGED` | User role changed |
| `PERMISSION_CHANGED` | Permission changed |
| `DELETE_REQUESTED` | Account deletion requested |
| `DELETE_CONFIRMED` | Account deletion confirmed |
| `ANONYMIZED` | User data anonymized |
| `PURGED` | User data purged |

---

## Security

### Access Control
- **SuperAdmin only** - Policy enforces SuperAdmin role check
- **RBAC permissions** - Plugin registers `plugin::audit-viewer.read` and `plugin::audit-viewer.export`

### PII Protection
- `ip_hash` and `sig` fields are not exposed to UI
- User-Agent is truncated to 100 characters
- Email/phone are never stored in meta

### Rate Limiting
- Export limited to 10,000 rows, 90 days max
- Page size limited to 100
- Date range limited to 31 days for UI queries

### SQL Injection Prevention
- All queries use Knex parameterized queries
- Filters are whitelist-validated

---

## Troubleshooting

### Plugin not showing in menu

1. Check if plugin is built: `ls plugin/dist/`
2. Rebuild Strapi: `rm -rf .cache && pnpm build`
3. Ensure you're logged in as SuperAdmin

### "Invalid hook call" error

This occurs when React is bundled multiple times. Ensure React is in `peerDependencies`, not `dependencies`.

After fixing, clean rebuild:
```bash
cd plugin && rm -rf node_modules dist
pnpm install && pnpm build
cd ../your-strapi-app && rm -rf .cache && pnpm build
```

### Empty table (but stats show count)

Date filter issue - the plugin now sets `toDate` to end of day (23:59:59). Make sure you have the latest version.

### No audit logs appearing

1. Check if migrations ran: `SELECT * FROM audit.audit_log_hot LIMIT 5;`
2. Check if middleware is active: Look for `request-context` in middlewares config
3. Check if extension is loaded: Look for login-related logs

### API 403 error

- SuperAdmin role is required
- Check RBAC permissions in Settings > Roles

---

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Changelog

### 1.0.0
- Initial release
- Strapi 5 compatibility
- PostgreSQL partition table support
- SuperAdmin-only access
- Dark/Light theme support
- CSV export functionality
- Date filter fix (end of day)
- Login fail direct logging (not just bucketing)

