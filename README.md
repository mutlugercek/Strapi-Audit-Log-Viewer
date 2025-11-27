# Strapi Audit Log Viewer Plugin

A custom Strapi 5 plugin for viewing audit logs directly from PostgreSQL partition tables. Designed for Strapi Community Edition.

## Features

- **Read-only audit log viewer** in Strapi Admin Panel
- **SuperAdmin only access** with RBAC permissions
- **Direct PostgreSQL queries** - no Content Types created
- **Partition table support** - works with `audit.audit_log` partitioned by date
- **Hot view optimization** - queries `audit.audit_log_hot` (last 90 days)
- **Filtering** - by date range, action, result, actor, target
- **Pagination** - configurable page size (max 100)
- **CSV Export** - export filtered results
- **PII Protection** - sensitive data (ip_hash, sig) not exposed to UI

## Requirements

- Strapi 5.x (tested with 5.27)
- PostgreSQL with `audit` schema
- Node.js >= 18.0.0

## Installation

### 1. Database Setup

Run the migration files in order:

```bash
psql -d your_database -f migrations/001_audit_schema.sql
psql -d your_database -f migrations/002_user_soft_delete.sql
```

This creates:
- `audit` schema
- `audit.audit_log` partitioned table (RANGE by `ts`)
- `audit.audit_log_hot` view (last 90 days)
- `audit.audit_bucket` for brute-force protection
- Required indexes (BRIN on `ts`, B-tree on action/actor/target)

### 2. Plugin Installation

#### Option A: Workspace Package (Monorepo)

1. Copy `plugin/` to your `packages/` directory:
```bash
cp -r plugin packages/strapi-plugin-audit-viewer
```

2. Add to your Strapi app's `package.json`:
```json
{
  "dependencies": {
    "strapi-plugin-audit-viewer": "workspace:*"
  }
}
```

3. Run install:
```bash
pnpm install
```

#### Option B: npm Package

```bash
npm install strapi-plugin-audit-viewer
# or
yarn add strapi-plugin-audit-viewer
# or
pnpm add strapi-plugin-audit-viewer
```

### 3. Enable Plugin

Add to `config/plugins.ts`:

```typescript
export default ({ env }) => ({
  'audit-viewer': {
    enabled: true,
  },
  // ... other plugins
});
```

### 4. Build

```bash
# Build plugin (if using workspace)
cd packages/strapi-plugin-audit-viewer
pnpm build

# Build Strapi
cd apps/cms  # or your Strapi directory
pnpm build
```

## Usage

1. Login to Strapi Admin Panel as **SuperAdmin**
2. Click "Audit Logs" in the left menu
3. Use filters to narrow down results
4. Click "View" to see log details
5. Click "Export CSV" to download filtered logs

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

## Audit Actions

The following actions are tracked:

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

## Directory Structure

```
audit_log_viewer/
├── README.md                 # This file
├── plugin/                   # Strapi plugin
│   ├── package.json
│   ├── tsconfig.json
│   ├── admin/src/
│   │   ├── index.tsx         # Admin entry point
│   │   ├── pluginId.ts
│   │   ├── pages/
│   │   │   └── AuditLogPage.tsx
│   │   └── translations/
│   │       ├── en.json
│   │       └── tr.json
│   └── server/src/
│       ├── index.ts
│       ├── bootstrap.ts
│       ├── routes/index.ts
│       ├── controllers/audit-viewer.ts
│       ├── services/audit-viewer.ts
│       └── policies/is-super-admin.ts
├── migrations/               # PostgreSQL migrations
│   ├── 001_audit_schema.sql
│   └── 002_user_soft_delete.sql
└── docs/                     # Documentation
    ├── AUDIT_LOG_VIEWER_PLUGIN.md
    └── AUDIT_SOFT_DELETE.md
```

## Security

- **SuperAdmin only** - Policy enforces SuperAdmin role check
- **RBAC permissions** - Plugin registers `plugin::audit-viewer.read` and `plugin::audit-viewer.export`
- **No PII in UI** - `ip_hash` and `sig` fields are not exposed
- **SQL injection safe** - All queries use Knex parameterized queries
- **Rate limiting** - Export limited to 10,000 rows, 90 days max

## Troubleshooting

### Plugin not showing in menu

1. Check if plugin is built: `ls plugin/dist/`
2. Rebuild Strapi: `rm -rf .cache && pnpm build`
3. Ensure you're logged in as SuperAdmin

### "Invalid hook call" error

This error occurs when React is bundled multiple times. Ensure React is in `peerDependencies`, not `dependencies`:

```json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

After fixing, clean rebuild:
```bash
cd plugin && rm -rf node_modules dist
pnpm install && pnpm build
cd ../apps/cms && rm -rf .cache && pnpm build
```

### Empty table

1. Check if `audit.audit_log_hot` view exists
2. Verify PostgreSQL connection
3. Check date filter range
4. Ensure audit logging is integrated in your application

### API 403 error

- SuperAdmin role is required
- Check RBAC permissions in Settings > Roles

## Integrating Audit Logging

To log events from your Strapi application, use the audit utility functions. Example:

```typescript
import { writeAudit } from './utils/audit';

// Log a successful login
await writeAudit(strapi, {
  ctx,
  actorType: 'user',
  actorId: userId,
  action: 'LOGIN_SUCCESS',
  result: 'success',
  targetType: 'user',
  targetId: userId,
  meta: { method: 'local' },
});
```

See `docs/AUDIT_SOFT_DELETE.md` for complete integration guide.

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
- CSV export functionality

