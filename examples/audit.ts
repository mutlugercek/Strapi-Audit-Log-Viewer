/**
 * Audit Logging Utility
 * 
 * This utility is used to write audit logs to PostgreSQL.
 * 
 * Installation:
 * 1. Save this file as src/utils/audit.ts
 * 2. Install request-context.ts middleware
 * 3. Run migration files
 * 
 * Usage:
 * import { auditLoginSuccess, auditLoginFail } from '../utils/audit';
 * await auditLoginSuccess(strapi, ctx, userId, { method: 'local' });
 */

import crypto from 'node:crypto';
import { hashIdentifier } from '../middlewares/request-context';

// ============================================================
// TYPES
// ============================================================

export type AuditAction =
  // Auth events
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAIL_BUCKETED'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_CONFIRM'
  | 'EMAIL_VERIFY'
  // Profile events
  | 'PROFILE_PUBLISH'
  | 'PROFILE_UNPUBLISH'
  | 'PROFILE_UPDATE_SENSITIVE'
  // Permission events
  | 'ROLE_CHANGED'
  | 'PERMISSION_CHANGED'
  // Account deletion events
  | 'DELETE_REQUESTED'
  | 'DELETE_CONFIRMED'
  | 'ANONYMIZED'
  | 'PURGED'
  // Admin events
  | 'ADMIN_IMPERSONATION'
  | 'ADMIN_BULK_UPDATE';

export type ActorType = 'user' | 'admin' | 'system' | 'anonymous';
export type AuditResult = 'success' | 'fail';

export interface AuditWriteInput {
  ctx?: any;                      // Koa context (optional)
  actorType: ActorType;
  actorId?: number | null;
  action: AuditAction;
  result: AuditResult;
  reasonCode?: string;
  targetType?: string;
  targetId?: number;
  meta?: Record<string, any>;
  requestId?: string | null;
  ipHash?: Buffer | null;
  ua?: string | null;
}

// ============================================================
// CONFIGURATION
// ============================================================

// HMAC secret for signature (tamper detection)
const AUDIT_SECRET = process.env.AUDIT_HMAC_SECRET || 'change-this-secret';

// Meta size limit (2KB)
const META_SIZE_LIMIT = 2048;

// Allowed meta keys (whitelist)
const ALLOWED_META_KEYS = new Set([
  'count',              // Bucket count
  'first_ts',           // Bucket first timestamp
  'window_start',       // Bucket window
  'identifier_hash',    // Hashed identifier
  'locale',             // User locale
  'fieldChanged',       // Changed field name
  'fromRoleId',         // Role change: previous role
  'toRoleId',           // Role change: new role
  'profileType',        // coach, organization, member
  'reason',             // Deletion/action reason
  'method',             // Auth method (local, google, etc)
  'tokenType',          // verify, reset
]);

// Fail-open mode: Don't break main flow if audit fails
const FAIL_OPEN = process.env.AUDIT_FAIL_OPEN !== 'false';

// ============================================================
// HELPERS
// ============================================================

/**
 * Sanitize and limit meta object
 */
function sanitizeMeta(meta?: Record<string, any>): Record<string, any> {
  if (!meta || typeof meta !== 'object') return {};
  
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(meta)) {
    // Only allow whitelisted keys
    if (!ALLOWED_META_KEYS.has(key)) continue;
    
    // Skip PII-like values
    if (typeof value === 'string') {
      if (value.includes('@')) continue; // Email
      if (/^\+?\d{10,}$/.test(value)) continue; // Phone
    }
    
    sanitized[key] = value;
  }
  
  // Check size limit
  const jsonStr = JSON.stringify(sanitized);
  if (jsonStr.length > META_SIZE_LIMIT) {
    const keys = Object.keys(sanitized);
    while (JSON.stringify(sanitized).length > META_SIZE_LIMIT && keys.length > 0) {
      const keyToRemove = keys.pop();
      if (keyToRemove) delete sanitized[keyToRemove];
    }
  }
  
  return sanitized;
}

/**
 * Generate HMAC signature for tamper detection
 */
function generateSignature(data: {
  ts: Date;
  actorType: ActorType;
  actorId?: number | null;
  action: AuditAction;
  result: AuditResult;
  targetType?: string;
  targetId?: number;
}): Buffer {
  const canonical = [
    data.ts.toISOString(),
    data.actorType,
    data.actorId ?? '',
    data.action,
    data.result,
    data.targetType ?? '',
    data.targetId ?? '',
  ].join('|');
  
  return crypto.createHmac('sha256', AUDIT_SECRET).update(canonical).digest();
}

// ============================================================
// MAIN AUDIT FUNCTION
// ============================================================

/**
 * Write audit log to PostgreSQL
 */
export async function writeAudit(strapi: any, input: AuditWriteInput): Promise<boolean> {
  try {
    const ts = new Date();
    
    // Extract from context if provided
    const requestId = input.requestId ?? input.ctx?.state?.requestId ?? null;
    const ipHash = input.ipHash ?? input.ctx?.state?.ipHash ?? null;
    const ua = input.ua ?? input.ctx?.state?.ua ?? null;
    
    // Sanitize meta
    const meta = sanitizeMeta(input.meta);
    
    // Generate signature
    const sig = generateSignature({
      ts,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      result: input.result,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    
    // Direct SQL insert to audit schema
    const knex = strapi.db.connection;
    
    await knex.raw(`
      INSERT INTO audit.audit_log (
        ts, actor_type, actor_id, action, result, reason_code,
        target_type, target_id, request_id, ip_hash, ua, meta, sig
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?::uuid, ?, ?, ?::jsonb, ?
      )
    `, [
      ts,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.result,
      input.reasonCode ?? null,
      input.targetType ?? null,
      input.targetId ?? null,
      requestId,
      ipHash,
      ua,
      JSON.stringify(meta),
      sig,
    ]);
    
    return true;
  } catch (error: any) {
    strapi.log.error(`[audit] Failed to write audit log: ${error.message}`);
    
    // Fail-open: Don't break main flow
    if (FAIL_OPEN) {
      return false;
    }
    
    throw error;
  }
}

// ============================================================
// BUCKET FUNCTIONS (Bruteforce/spam protection)
// ============================================================

/**
 * 5-minute bucket window
 */
function getBucketWindow(): Date {
  const now = new Date();
  const minutes = Math.floor(now.getMinutes() / 5) * 5;
  now.setMinutes(minutes, 0, 0);
  return now;
}

/**
 * Upsert login fail bucket (rate limiting)
 */
export async function upsertLoginFailBucket(
  strapi: any,
  input: { ipHash: Buffer; identifier: string; }
): Promise<void> {
  try {
    const windowStart = getBucketWindow();
    const identifierHash = hashIdentifier(input.identifier);
    const action = 'LOGIN_FAIL_BUCKETED';
    
    const knex = strapi.db.connection;
    
    await knex.raw(`
      INSERT INTO audit.audit_bucket (
        window_start, action, ip_hash, identifier_hash, count, first_ts, last_ts
      ) VALUES (?, ?, ?, ?, 1, now(), now())
      ON CONFLICT (window_start, action, ip_hash, identifier_hash)
      DO UPDATE SET
        count = audit.audit_bucket.count + 1,
        last_ts = now()
    `, [windowStart, action, input.ipHash, identifierHash]);
  } catch (error: any) {
    strapi.log.error(`[audit] Failed to upsert login fail bucket: ${error.message}`);
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Log successful login
 */
export async function auditLoginSuccess(
  strapi: any,
  ctx: any,
  userId: number,
  meta?: Record<string, any>
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: 'user',
    actorId: userId,
    action: 'LOGIN_SUCCESS',
    result: 'success',
    targetType: 'user',
    targetId: userId,
    meta,
  });
}

/**
 * Log failed login (bucket + audit_log)
 */
export async function auditLoginFail(
  strapi: any,
  ctx: any,
  identifier: string,
  reasonCode?: string
): Promise<void> {
  // Write to bucket (for rate limiting)
  const ipHash = ctx?.state?.ipHash;
  if (ipHash) {
    await upsertLoginFailBucket(strapi, { ipHash, identifier });
  }
  
  // Also write directly to audit_log (visible in Audit Viewer)
  await writeAudit(strapi, {
    ctx,
    actorType: 'anonymous',
    actorId: null,
    action: 'LOGIN_FAIL_BUCKETED',
    result: 'fail',
    reasonCode: reasonCode || 'INVALID_CREDENTIALS',
    targetType: 'user',
    meta: { identifier_hash: hashIdentifier(identifier).toString('hex').substring(0, 16) },
  });
}

/**
 * Log password reset request
 */
export async function auditPasswordResetRequest(
  strapi: any,
  ctx: any,
  userId?: number
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: userId ? 'user' : 'anonymous',
    actorId: userId,
    action: 'PASSWORD_RESET_REQUEST',
    result: 'success',
    targetType: userId ? 'user' : undefined,
    targetId: userId,
  });
}

/**
 * Log password reset confirmation
 */
export async function auditPasswordResetConfirm(
  strapi: any,
  ctx: any,
  userId: number
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: 'user',
    actorId: userId,
    action: 'PASSWORD_RESET_CONFIRM',
    result: 'success',
    targetType: 'user',
    targetId: userId,
  });
}

/**
 * Log email verification
 */
export async function auditEmailVerify(
  strapi: any,
  ctx: any,
  userId: number
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: 'user',
    actorId: userId,
    action: 'EMAIL_VERIFY',
    result: 'success',
    targetType: 'user',
    targetId: userId,
  });
}

/**
 * Log profile publish/unpublish
 */
export async function auditProfilePublish(
  strapi: any,
  ctx: any,
  input: {
    actorId?: number;
    targetType: string;
    targetId: number;
    isPublish: boolean;
  }
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: input.actorId ? 'user' : 'system',
    actorId: input.actorId,
    action: input.isPublish ? 'PROFILE_PUBLISH' : 'PROFILE_UNPUBLISH',
    result: 'success',
    targetType: input.targetType,
    targetId: input.targetId,
    meta: { profileType: input.targetType },
  });
}

/**
 * Log role change
 */
export async function auditRoleChange(
  strapi: any,
  ctx: any,
  input: {
    actorId?: number;
    targetUserId: number;
    fromRoleId?: number;
    toRoleId?: number;
  }
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: input.actorId ? 'admin' : 'system',
    actorId: input.actorId,
    action: 'ROLE_CHANGED',
    result: 'success',
    targetType: 'user',
    targetId: input.targetUserId,
    meta: {
      fromRoleId: input.fromRoleId,
      toRoleId: input.toRoleId,
    },
  });
}

/**
 * Log account deletion events
 */
export async function auditAccountDeletion(
  strapi: any,
  ctx: any,
  input: {
    action: 'DELETE_REQUESTED' | 'DELETE_CONFIRMED' | 'ANONYMIZED' | 'PURGED';
    actorId?: number;
    targetUserId: number;
    reason?: string;
  }
): Promise<void> {
  await writeAudit(strapi, {
    ctx,
    actorType: input.actorId ? 'user' : 'system',
    actorId: input.actorId,
    action: input.action,
    result: 'success',
    targetType: 'user',
    targetId: input.targetUserId,
    meta: input.reason ? { reason: input.reason } : undefined,
  });
}
