// Service: Direct PostgreSQL queries to audit schema (no CT)

import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'audit-viewer';

// Query constraints (prevent abuse)
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_DATE_RANGE_DAYS = 31; // UI query max 31 days
const MAX_EXPORT_DAYS = 90; // Export max 90 days

// Allowed filter fields (whitelist)
const ALLOWED_FILTERS = new Set([
  'action',
  'result',
  'actor_type',
  'actor_id',
  'target_type',
  'target_id',
  'request_id',
]);

// Audit actions enum (for dropdown)
const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAIL_BUCKETED',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_CONFIRM',
  'EMAIL_VERIFY',
  'PROFILE_PUBLISH',
  'PROFILE_UNPUBLISH',
  'PROFILE_UPDATE_SENSITIVE',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'DELETE_REQUESTED',
  'DELETE_CONFIRMED',
  'ANONYMIZED',
  'PURGED',
  'ADMIN_IMPERSONATION',
  'ADMIN_BULK_UPDATE',
];

interface QueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  action?: string;
  result?: string;
  actorType?: string;
  actorId?: number;
  targetType?: string;
  targetId?: number;
  requestId?: string;
}

interface AuditRow {
  id: number;
  ts: string;
  actor_type: string;
  actor_id: number | null;
  action: string;
  result: string;
  reason_code: string | null;
  target_type: string | null;
  target_id: number | null;
  request_id: string | null;
  ua: string | null;
  meta: Record<string, any>;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Find audit logs with pagination and filters
   */
  async findMany(params: QueryParams): Promise<{ data: AuditRow[]; meta: { pagination: any } }> {
    const knex = strapi.db.connection;

    // Pagination
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;

    // Date range with defaults and limits
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    let fromDate = params.from ? new Date(params.from) : defaultFrom;
    let toDate = params.to ? new Date(params.to) : now;
    
    // Set toDate to end of day (23:59:59.999)
    if (params.to) {
      toDate.setHours(23, 59, 59, 999);
    }

    // Validate date range (max 31 days for UI queries)
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_DATE_RANGE_DAYS) {
      fromDate = new Date(toDate.getTime() - MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000);
    }

    // Build query
    let query = knex('audit.audit_log_hot')
      .select([
        'id', 'ts', 'actor_type', 'actor_id', 'action', 'result',
        'reason_code', 'target_type', 'target_id', 'request_id', 'ua', 'meta',
      ])
      .where('ts', '>=', fromDate)
      .where('ts', '<=', toDate)
      .orderBy('ts', 'desc')
      .limit(pageSize)
      .offset(offset);

    // Apply filters (parameterized - SQL injection safe)
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      query = query.where('action', params.action);
    }
    if (params.result && ['success', 'fail'].includes(params.result)) {
      query = query.where('result', params.result);
    }
    if (params.actorType && ['user', 'admin', 'system', 'anonymous'].includes(params.actorType)) {
      query = query.where('actor_type', params.actorType);
    }
    if (params.actorId && Number.isInteger(params.actorId)) {
      query = query.where('actor_id', params.actorId);
    }
    if (params.targetType && typeof params.targetType === 'string' && params.targetType.length <= 50) {
      query = query.where('target_type', params.targetType);
    }
    if (params.targetId && Number.isInteger(params.targetId)) {
      query = query.where('target_id', params.targetId);
    }
    if (params.requestId && /^[0-9a-f-]{36}$/i.test(params.requestId)) {
      query = query.where('request_id', params.requestId);
    }

    // Execute query
    const data = await query;

    // Count query (same filters)
    let countQuery = knex('audit.audit_log_hot')
      .count('* as total')
      .where('ts', '>=', fromDate)
      .where('ts', '<=', toDate);

    // Apply same filters to count
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      countQuery = countQuery.where('action', params.action);
    }
    if (params.result && ['success', 'fail'].includes(params.result)) {
      countQuery = countQuery.where('result', params.result);
    }
    if (params.actorType && ['user', 'admin', 'system', 'anonymous'].includes(params.actorType)) {
      countQuery = countQuery.where('actor_type', params.actorType);
    }
    if (params.actorId && Number.isInteger(params.actorId)) {
      countQuery = countQuery.where('actor_id', params.actorId);
    }
    if (params.targetType && typeof params.targetType === 'string' && params.targetType.length <= 50) {
      countQuery = countQuery.where('target_type', params.targetType);
    }
    if (params.targetId && Number.isInteger(params.targetId)) {
      countQuery = countQuery.where('target_id', params.targetId);
    }
    if (params.requestId && /^[0-9a-f-]{36}$/i.test(params.requestId)) {
      countQuery = countQuery.where('request_id', params.requestId);
    }

    const countResult = await countQuery;
    const total = Number(countResult[0]?.total) || 0;

    return {
      data: data.map(this.sanitizeRow),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  /**
   * Find single audit log by ID
   */
  async findOne(id: number): Promise<AuditRow | null> {
    const knex = strapi.db.connection;

    const result = await knex('audit.audit_log_hot')
      .select('*')
      .where('id', id)
      .first();

    return result ? this.sanitizeRow(result) : null;
  },

  /**
   * Get available actions for dropdown
   */
  getActions(): string[] {
    return AUDIT_ACTIONS;
  },

  /**
   * Get audit statistics
   */
  async getStats(): Promise<any> {
    const knex = strapi.db.connection;

    // Stats from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalResult, actionStats, resultStats] = await Promise.all([
      // Total count
      knex('audit.audit_log_hot')
        .count('* as total')
        .where('ts', '>=', sevenDaysAgo),
      
      // By action (top 10)
      knex('audit.audit_log_hot')
        .select('action')
        .count('* as count')
        .where('ts', '>=', sevenDaysAgo)
        .groupBy('action')
        .orderBy('count', 'desc')
        .limit(10),
      
      // By result
      knex('audit.audit_log_hot')
        .select('result')
        .count('* as count')
        .where('ts', '>=', sevenDaysAgo)
        .groupBy('result'),
    ]);

    return {
      total: Number(totalResult[0]?.total) || 0,
      byAction: actionStats,
      byResult: resultStats,
      period: '7 days',
    };
  },

  /**
   * Export audit logs as CSV
   */
  async exportCsv(params: QueryParams): Promise<string> {
    const knex = strapi.db.connection;

    // Date range for export (max 90 days)
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let fromDate = params.from ? new Date(params.from) : defaultFrom;
    let toDate = params.to ? new Date(params.to) : now;
    
    // Set toDate to end of day (23:59:59.999)
    if (params.to) {
      toDate.setHours(23, 59, 59, 999);
    }

    // Limit export range
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_EXPORT_DAYS) {
      fromDate = new Date(toDate.getTime() - MAX_EXPORT_DAYS * 24 * 60 * 60 * 1000);
    }

    // Build query (no pagination for export, but limit to 10000 rows)
    let query = knex('audit.audit_log_hot')
      .select([
        'id', 'ts', 'actor_type', 'actor_id', 'action', 'result',
        'reason_code', 'target_type', 'target_id', 'request_id',
      ])
      .where('ts', '>=', fromDate)
      .where('ts', '<=', toDate)
      .orderBy('ts', 'desc')
      .limit(10000);

    // Apply filters
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      query = query.where('action', params.action);
    }
    if (params.result && ['success', 'fail'].includes(params.result)) {
      query = query.where('result', params.result);
    }

    const data = await query;

    // Generate CSV
    const headers = ['ID', 'Timestamp', 'Actor Type', 'Actor ID', 'Action', 'Result', 'Reason', 'Target Type', 'Target ID', 'Request ID'];
    const rows = data.map((row: any) => [
      row.id,
      row.ts,
      row.actor_type,
      row.actor_id ?? '',
      row.action,
      row.result,
      row.reason_code ?? '',
      row.target_type ?? '',
      row.target_id ?? '',
      row.request_id ?? '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csv;
  },

  /**
   * Sanitize row (remove sensitive data, ensure no PII leaks)
   */
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
      ua: row.ua ? row.ua.substring(0, 100) : null, // Truncate UA
      meta: row.meta || {},
      // ip_hash and sig are not displayed (security)
    };
  },
});

