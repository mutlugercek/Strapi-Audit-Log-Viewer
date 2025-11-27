# Audit Log Viewer Plugin - Technical Documentation

## Overview

Audit Log Viewer is a custom plugin developed to view audit logs within the Strapi 5.27 Admin Panel. It reads data directly from the partitioned `audit.audit_log` table in PostgreSQL and provides read-only access to SuperAdmin users.

**Important**: This plugin does not conflict with Strapi's paid "Audit Logs" feature. It is specifically developed for the Community edition.

---

## Architecture

### Plugin Location

```
packages/strapi-plugin-audit-viewer/
├── package.json                    # Plugin manifest
├── tsconfig.json                   # TypeScript configuration
├── dist/                           # Build outputs
├── admin/
│   └── src/
│       ├── index.tsx               # Admin entry point
│       ├── pluginId.ts             # Plugin ID constant
│       ├── pages/
│       │   └── AuditLogPage.tsx    # Main UI component
│       └── translations/
│           ├── en.json             # English translations
│           └── tr.json             # Turkish translations
└── server/
    └── src/
        ├── index.ts                # Server entry point
        ├── bootstrap.ts            # RBAC permission registration
        ├── routes/
        │   └── index.ts            # Admin-type route definitions
        ├── controllers/
        │   ├── index.ts
        │   └── audit-viewer.ts     # HTTP handlers
        ├── services/
        │   ├── index.ts
        │   └── audit-viewer.ts     # DB query logic
        └── policies/
            ├── index.ts
            └── is-super-admin.ts   # SuperAdmin policy

```

### Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Strapi Admin   │────▶│  Plugin Routes   │────▶│  Plugin Service     │
│  (React UI)     │     │  (type: admin)   │     │  (Knex queries)     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
        ▲                       │                          │
        │                       ▼                          ▼
        │               ┌──────────────────┐     ┌─────────────────────┐
        │               │  SuperAdmin      │     │  PostgreSQL         │
        │               │  Policy Check    │     │  audit.audit_log    │
        │               └──────────────────┘     └─────────────────────┘
        │                                                  │
        └──────────────────────────────────────────────────┘
                        JSON Response
```

---

## Quick Start (For New Projects)

### 1. Database Setup

Run the migration files in PostgreSQL:

```bash
# Using pgAdmin or psql
psql -h localhost -U your_user -d your_db -f migrations/001_audit_schema.sql
psql -h localhost -U your_user -d your_db -f migrations/002_user_soft_delete.sql
```

### 2. Plugin Installation

```bash
# NPM
npm install strapi-plugin-audit-viewer

# or Yarn
yarn add strapi-plugin-audit-viewer

# or pnpm
pnpm add strapi-plugin-audit-viewer
```

### 3. Plugin Activation

`config/plugins.ts` (or `.js`):

```typescript
export default ({ env }) => ({
  'audit-viewer': {
    enabled: true,
  },
  // ... other plugins
});
```

### 4. Environment Variables

Add to your `.env` file:

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

**Secret Generation**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Build and Start

```bash
cd your-strapi-app
pnpm build
pnpm develop
```

---

## Strapi Integration (Audit Logging)

The plugin only provides log **reading**. For log **writing**, you need to add the following integrations to your Strapi application:

### Required Files

#### 1. Request Context Middleware

`src/middlewares/request-context.ts`:

```typescript
import crypto from 'node:crypto';

const IP_HASH_SALT = process.env.AUDIT_IP_SALT || 'default-salt';
const IDENTIFIER_HASH_SALT = process.env.AUDIT_IDENTIFIER_SALT || 'default-id-salt';
const UA_MAX_LENGTH = 300;

function maskIp(ip: string): string {
  const ipv4Parts = ip.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every(p => /^\d+$/.test(p))) {
    ipv4Parts[3] = '0';
    return ipv4Parts.join('.');
  }
  if (ip.includes(':')) {
    const segments = ip.split(':');
    if (segments.length >= 3) {
      return segments.slice(0, 3).join(':') + ':0:0:0:0:0';
    }
  }
  return ip;
}

export function hashIp(ip: string): Buffer {
  const masked = maskIp(ip);
  return crypto.createHash('sha256').update(masked + IP_HASH_SALT).digest();
}

export function hashIdentifier(identifier: string): Buffer {
  const normalized = String(identifier).trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized + IDENTIFIER_HASH_SALT).digest();
}

export function truncateUa(ua: string | undefined): string | null {
  if (!ua) return null;
  return ua.length > UA_MAX_LENGTH ? ua.substring(0, UA_MAX_LENGTH) : ua;
}

export function getClientIp(ctx: any): string {
  const xff = ctx.request?.headers?.['x-forwarded-for'];
  if (xff) {
    const firstIp = String(xff).split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const xri = ctx.request?.headers?.['x-real-ip'];
  if (xri) return String(xri).trim();
  return ctx.request?.ip || ctx.ip || '0.0.0.0';
}

export function extractRequestContext(ctx: any) {
  const requestId = ctx.request?.headers?.['x-request-id'] || null;
  const clientIp = getClientIp(ctx);
  const ipHash = hashIp(clientIp);
  const ua = truncateUa(ctx.request?.headers?.['user-agent']);
  return { requestId, clientIp, ipHash, ua };
}

export default (config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    const reqCtx = extractRequestContext(ctx);
    ctx.state = ctx.state || {};
    ctx.state.requestContext = reqCtx;
    ctx.state.requestId = reqCtx.requestId;
    ctx.state.ipHash = reqCtx.ipHash;
    ctx.state.ua = reqCtx.ua;
    if (reqCtx.requestId) {
      ctx.set('x-request-id', reqCtx.requestId);
    }
    await next();
  };
};
```

#### 2. Middleware Activation

`config/middlewares.ts`:

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
  // Add request context middleware
  'global::request-context',
];
```

#### 3. Audit Utility

See `examples/audit.ts` for the complete audit utility file.

#### 4. Users-Permissions Extension

See `examples/strapi-server.ts` for the complete extension file.

---

## Server Side

### Routes (`server/src/routes/index.ts`)

All routes are defined as `type: 'admin'` - accessible only through the Admin Panel.

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/logs` | `findMany` | Paginated log list |
| GET | `/logs/:id` | `findOne` | Single log detail |
| GET | `/actions` | `getActions` | Action dropdown list |
| GET | `/stats` | `getStats` | 7-day statistics |
| GET | `/export` | `exportCsv` | CSV export |

### Policies

Each route is protected by two policies:

1. **`admin::isAuthenticatedAdmin`** - Strapi built-in admin auth
2. **`plugin::audit-viewer.is-super-admin`** - Custom SuperAdmin check

```typescript
// is-super-admin.ts
const isSuperAdmin = admin.roles?.some(
  (role: any) => role.code === 'strapi-super-admin' || role.name === 'Super Admin'
);
```

### Service (`server/src/services/audit-viewer.ts`)

#### Query Constraints

```typescript
const MAX_PAGE_SIZE = 100;        // Maximum records per page
const DEFAULT_PAGE_SIZE = 25;     // Default page size
const MAX_DATE_RANGE_DAYS = 31;   // Max date range for UI queries
const MAX_EXPORT_DAYS = 90;       // Max date range for export
```

#### Date Filter Fix

End date (`toDate`) is set to end of day (23:59:59.999):

```typescript
let toDate = params.to ? new Date(params.to) : now;

// Set toDate to end of day
if (params.to) {
  toDate.setHours(23, 59, 59, 999);
}
```

This fix ensures that records made on the same day are not filtered out.

#### Supported Filters (Whitelist)

```typescript
const ALLOWED_FILTERS = new Set([
  'action',
  'result',
  'actor_type',
  'actor_id',
  'target_type',
  'target_id',
  'request_id',
]);
```

#### PII Protection

The `sanitizeRow` function filters sensitive data:

```typescript
sanitizeRow(row: any): AuditRow {
  return {
    id: row.id,
    ts: row.ts,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    action: row.action,
    result: row.result,
    reason_code: row.reason_code,
    target_type: row.target_type,
    target_id: row.target_id,
    request_id: row.request_id,
    ua: row.ua ? row.ua.substring(0, 100) : null, // UA truncated
    meta: row.meta || {},
    // ip_hash and sig are not displayed (security)
  };
}
```

---

## Admin UI

### Style Compatibility

The UI is designed to be compatible with both light and dark themes of the Strapi Admin Panel:

- Table rows: White background (`#ffffff`) and dark text (`#32324d`)
- Stat cards: Border and shadow for clear separation
- Badges: Color-coded (success: green, fail: red, action: purple)
- Modal: Clean background and readable text

### Features

1. **Statistics Cards**: Total, success, failed, most frequent action
2. **Filters**: Date range, action dropdown, result select
3. **Table**: Timestamp, action, result, actor, target, request ID, detail button
4. **Pagination**: Page navigation
5. **Detail Modal**: All log fields, meta JSON pretty view
6. **CSV Export**: Export based on filters

---

## Database Requirements

### Migration Files

#### 001_audit_schema.sql

```sql
-- Audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Partitioned audit log table
CREATE TABLE IF NOT EXISTS audit.audit_log (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type    TEXT NOT NULL,
  actor_id      BIGINT,
  action        TEXT NOT NULL,
  result        TEXT NOT NULL,
  reason_code   TEXT,
  target_type   TEXT,
  target_id     BIGINT,
  request_id    UUID,
  ip_hash       BYTEA,
  ua            TEXT,
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
  sig           BYTEA,
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- Meta size constraint
ALTER TABLE audit.audit_log ADD CONSTRAINT audit_meta_size 
  CHECK (pg_column_size(meta) <= 2048);

-- Hot view (last 90 days)
CREATE OR REPLACE VIEW audit.audit_log_hot AS
  SELECT * FROM audit.audit_log 
  WHERE ts >= now() - interval '90 days';

-- Bucket table for rate limiting
CREATE TABLE IF NOT EXISTS audit.audit_bucket (
  window_start  TIMESTAMPTZ NOT NULL,
  action        TEXT NOT NULL,
  ip_hash       BYTEA NOT NULL,
  identifier_hash BYTEA NOT NULL,
  count         INT NOT NULL DEFAULT 1,
  first_ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (window_start, action, ip_hash, identifier_hash)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_ts_brin 
  ON audit.audit_log USING BRIN (ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_action 
  ON audit.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor 
  ON audit.audit_log (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target 
  ON audit.audit_log (target_type, target_id);
```

#### 002_user_soft_delete.sql

```sql
-- Soft delete fields for users
ALTER TABLE public.up_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted', 'deleted_pending_purge', 'purged'));
ALTER TABLE public.up_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.up_users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
ALTER TABLE public.up_users ADD COLUMN IF NOT EXISTS delete_confirm_token_hash TEXT;
ALTER TABLE public.up_users ADD COLUMN IF NOT EXISTS delete_confirm_token_expires_at TIMESTAMPTZ;
```

---

## Security

### Access Control

1. **Route Level**: `admin::isAuthenticatedAdmin` + `is-super-admin` policy
2. **UI Level**: RBAC permission check (`plugin::audit-viewer.read`)
3. **Data Level**: PII scrubbing (ip_hash, sig not displayed)

### Rate Limiting

- Export max 10,000 record limit
- Date range limits (UI: 31 days, Export: 90 days)
- Page size limit (max 100)

### Input Validation

- All filters are checked with whitelist
- SQL injection protection (Knex parameterized queries)
- Request ID UUID format validation

---

## Troubleshooting

### Plugin Not Showing in Menu

1. Check if plugin is built
2. Strapi rebuild: `rm -rf .cache dist && pnpm build`
3. Ensure you're logged in as SuperAdmin

### "Invalid hook call" Error

Caused by multiple copies of React being loaded.

**Solution**: React and Design System should be defined as `peerDependencies` in the plugin's `package.json`.

### Empty Table

- Check if `audit.audit_log_hot` view exists
- Check if date filter is correct
- Ensure audit logging integration is done

### Records Not Showing (Stats show count but table is empty)

Could be a date filter issue. End date should be set to end of day:
```typescript
toDate.setHours(23, 59, 59, 999);
```

---

## Audit Log Integration Summary

| Event | Function | Triggered From |
|-------|----------|----------------|
| Successful login | `auditLoginSuccess()` | `strapi-server.ts` |
| Failed login | `auditLoginFail()` | `strapi-server.ts` |
| Deleted account login | `auditLoginFail()` | `strapi-server.ts` |
| Unverified account login | `auditLoginFail()` | `strapi-server.ts` |
| Password reset request | `auditPasswordResetRequest()` | `strapi-server.ts` |
| Password reset confirmation | `auditPasswordResetConfirm()` | `strapi-server.ts` |
| Email verification | `auditEmailVerify()` | `custom.ts` |
| Account deletion request | `auditAccountDeletion()` | `account.ts` |
| Account deletion confirmation | `auditAccountDeletion()` | `account.ts` |

---

## Version Information

| Component | Version |
|-----------|---------|
| Plugin | 1.0.0 |
| Strapi | 5.27.0 |
| Node.js | >=18.0.0 <=22.x.x |

---

## Related Documents

- [Strapi 5 Plugin Development](https://docs.strapi.io/dev-docs/plugins/development/create-a-plugin)
- [Strapi Admin Panel API](https://docs.strapi.io/dev-docs/admin-panel-api)
