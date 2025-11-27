"use strict";
const PLUGIN_ID$2 = "audit-viewer";
const bootstrap = async ({ strapi }) => {
  const actions = [
    {
      section: "plugins",
      displayName: "View Audit Logs",
      uid: "read",
      pluginName: PLUGIN_ID$2
    },
    {
      section: "plugins",
      displayName: "Export Audit Logs",
      uid: "export",
      pluginName: PLUGIN_ID$2
    }
  ];
  try {
    await strapi.admin?.services?.permission?.actionProvider?.registerMany(actions);
    strapi.log.info(`[${PLUGIN_ID$2}] Plugin permissions registered`);
  } catch (error) {
    strapi.log.warn(`[${PLUGIN_ID$2}] Failed to register permissions: ${error.message}`);
  }
  strapi.log.info(`[${PLUGIN_ID$2}] Plugin bootstrapped successfully`);
};
const routes = {
  // Admin routes (type: 'admin' - only accessible via admin panel)
  admin: {
    type: "admin",
    routes: [
      // List audit logs with pagination and filters
      {
        method: "GET",
        path: "/logs",
        handler: "audit-viewer.findMany",
        config: {
          policies: ["admin::isAuthenticatedAdmin", "plugin::audit-viewer.is-super-admin"]
        }
      },
      // Get single audit log detail
      {
        method: "GET",
        path: "/logs/:id",
        handler: "audit-viewer.findOne",
        config: {
          policies: ["admin::isAuthenticatedAdmin", "plugin::audit-viewer.is-super-admin"]
        }
      },
      // Get distinct actions for dropdown
      {
        method: "GET",
        path: "/actions",
        handler: "audit-viewer.getActions",
        config: {
          policies: ["admin::isAuthenticatedAdmin", "plugin::audit-viewer.is-super-admin"]
        }
      },
      // Get audit statistics
      {
        method: "GET",
        path: "/stats",
        handler: "audit-viewer.getStats",
        config: {
          policies: ["admin::isAuthenticatedAdmin", "plugin::audit-viewer.is-super-admin"]
        }
      },
      // Export as CSV
      {
        method: "GET",
        path: "/export",
        handler: "audit-viewer.exportCsv",
        config: {
          policies: ["admin::isAuthenticatedAdmin", "plugin::audit-viewer.is-super-admin"]
        }
      }
    ]
  }
};
const PLUGIN_ID$1 = "audit-viewer";
const auditViewer$1 = ({ strapi }) => ({
  /**
   * GET /audit-viewer/logs
   * List audit logs with pagination and filters
   */
  async findMany(ctx) {
    try {
      const service = strapi.plugin(PLUGIN_ID$1).service("audit-viewer");
      const params = {
        page: ctx.query.page ? parseInt(ctx.query.page, 10) : 1,
        pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize, 10) : 25,
        from: ctx.query.from,
        to: ctx.query.to,
        action: ctx.query.action,
        result: ctx.query.result,
        actorType: ctx.query.actorType,
        actorId: ctx.query.actorId ? parseInt(ctx.query.actorId, 10) : void 0,
        targetType: ctx.query.targetType,
        targetId: ctx.query.targetId ? parseInt(ctx.query.targetId, 10) : void 0,
        requestId: ctx.query.requestId
      };
      const result = await service.findMany(params);
      ctx.body = result;
    } catch (error) {
      strapi.log.error(`[${PLUGIN_ID$1}] findMany error: ${error.message}`);
      ctx.throw(500, "Failed to fetch audit logs");
    }
  },
  /**
   * GET /audit-viewer/logs/:id
   * Get single audit log detail
   */
  async findOne(ctx) {
    try {
      const { id } = ctx.params;
      const numId = parseInt(id, 10);
      if (!numId || isNaN(numId)) {
        return ctx.badRequest("Invalid ID");
      }
      const service = strapi.plugin(PLUGIN_ID$1).service("audit-viewer");
      const result = await service.findOne(numId);
      if (!result) {
        return ctx.notFound("Audit log not found");
      }
      ctx.body = { data: result };
    } catch (error) {
      strapi.log.error(`[${PLUGIN_ID$1}] findOne error: ${error.message}`);
      ctx.throw(500, "Failed to fetch audit log");
    }
  },
  /**
   * GET /audit-viewer/actions
   * Get available actions for dropdown
   */
  async getActions(ctx) {
    try {
      const service = strapi.plugin(PLUGIN_ID$1).service("audit-viewer");
      const actions = service.getActions();
      ctx.body = { data: actions };
    } catch (error) {
      strapi.log.error(`[${PLUGIN_ID$1}] getActions error: ${error.message}`);
      ctx.throw(500, "Failed to fetch actions");
    }
  },
  /**
   * GET /audit-viewer/stats
   * Get audit statistics
   */
  async getStats(ctx) {
    try {
      const service = strapi.plugin(PLUGIN_ID$1).service("audit-viewer");
      const stats = await service.getStats();
      ctx.body = { data: stats };
    } catch (error) {
      strapi.log.error(`[${PLUGIN_ID$1}] getStats error: ${error.message}`);
      ctx.throw(500, "Failed to fetch statistics");
    }
  },
  /**
   * GET /audit-viewer/export
   * Export audit logs as CSV
   */
  async exportCsv(ctx) {
    try {
      const service = strapi.plugin(PLUGIN_ID$1).service("audit-viewer");
      const params = {
        from: ctx.query.from,
        to: ctx.query.to,
        action: ctx.query.action,
        result: ctx.query.result
      };
      const csv = await service.exportCsv(params);
      const filename = `audit-logs-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
      ctx.set("Content-Type", "text/csv; charset=utf-8");
      ctx.set("Content-Disposition", `attachment; filename="${filename}"`);
      ctx.body = csv;
    } catch (error) {
      strapi.log.error(`[${PLUGIN_ID$1}] exportCsv error: ${error.message}`);
      ctx.throw(500, "Failed to export audit logs");
    }
  }
});
const controllers = {
  "audit-viewer": auditViewer$1
};
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_DATE_RANGE_DAYS = 31;
const MAX_EXPORT_DAYS = 90;
const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAIL_BUCKETED",
  "PASSWORD_RESET_REQUEST",
  "PASSWORD_RESET_CONFIRM",
  "EMAIL_VERIFY",
  "PROFILE_PUBLISH",
  "PROFILE_UNPUBLISH",
  "PROFILE_UPDATE_SENSITIVE",
  "ROLE_CHANGED",
  "PERMISSION_CHANGED",
  "DELETE_REQUESTED",
  "DELETE_CONFIRMED",
  "ANONYMIZED",
  "PURGED",
  "ADMIN_IMPERSONATION",
  "ADMIN_BULK_UPDATE"
];
const auditViewer = ({ strapi }) => ({
  /**
   * Find audit logs with pagination and filters
   */
  async findMany(params) {
    const knex = strapi.db.connection;
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;
    const now = /* @__PURE__ */ new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
    let fromDate = params.from ? new Date(params.from) : defaultFrom;
    let toDate = params.to ? new Date(params.to) : now;
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1e3);
    if (rangeDays > MAX_DATE_RANGE_DAYS) {
      fromDate = new Date(toDate.getTime() - MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1e3);
    }
    let query = knex("audit.audit_log_hot").select([
      "id",
      "ts",
      "actor_type",
      "actor_id",
      "action",
      "result",
      "reason_code",
      "target_type",
      "target_id",
      "request_id",
      "ua",
      "meta"
    ]).where("ts", ">=", fromDate).where("ts", "<=", toDate).orderBy("ts", "desc").limit(pageSize).offset(offset);
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      query = query.where("action", params.action);
    }
    if (params.result && ["success", "fail"].includes(params.result)) {
      query = query.where("result", params.result);
    }
    if (params.actorType && ["user", "admin", "system", "anonymous"].includes(params.actorType)) {
      query = query.where("actor_type", params.actorType);
    }
    if (params.actorId && Number.isInteger(params.actorId)) {
      query = query.where("actor_id", params.actorId);
    }
    if (params.targetType && typeof params.targetType === "string" && params.targetType.length <= 50) {
      query = query.where("target_type", params.targetType);
    }
    if (params.targetId && Number.isInteger(params.targetId)) {
      query = query.where("target_id", params.targetId);
    }
    if (params.requestId && /^[0-9a-f-]{36}$/i.test(params.requestId)) {
      query = query.where("request_id", params.requestId);
    }
    const data = await query;
    let countQuery = knex("audit.audit_log_hot").count("* as total").where("ts", ">=", fromDate).where("ts", "<=", toDate);
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      countQuery = countQuery.where("action", params.action);
    }
    if (params.result && ["success", "fail"].includes(params.result)) {
      countQuery = countQuery.where("result", params.result);
    }
    if (params.actorType && ["user", "admin", "system", "anonymous"].includes(params.actorType)) {
      countQuery = countQuery.where("actor_type", params.actorType);
    }
    if (params.actorId && Number.isInteger(params.actorId)) {
      countQuery = countQuery.where("actor_id", params.actorId);
    }
    if (params.targetType && typeof params.targetType === "string" && params.targetType.length <= 50) {
      countQuery = countQuery.where("target_type", params.targetType);
    }
    if (params.targetId && Number.isInteger(params.targetId)) {
      countQuery = countQuery.where("target_id", params.targetId);
    }
    if (params.requestId && /^[0-9a-f-]{36}$/i.test(params.requestId)) {
      countQuery = countQuery.where("request_id", params.requestId);
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
          total
        }
      }
    };
  },
  /**
   * Find single audit log by ID
   */
  async findOne(id) {
    const knex = strapi.db.connection;
    const result = await knex("audit.audit_log_hot").select("*").where("id", id).first();
    return result ? this.sanitizeRow(result) : null;
  },
  /**
   * Get available actions for dropdown
   */
  getActions() {
    return AUDIT_ACTIONS;
  },
  /**
   * Get audit statistics
   */
  async getStats() {
    const knex = strapi.db.connection;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3);
    const [totalResult, actionStats, resultStats] = await Promise.all([
      // Total count
      knex("audit.audit_log_hot").count("* as total").where("ts", ">=", sevenDaysAgo),
      // By action (top 10)
      knex("audit.audit_log_hot").select("action").count("* as count").where("ts", ">=", sevenDaysAgo).groupBy("action").orderBy("count", "desc").limit(10),
      // By result
      knex("audit.audit_log_hot").select("result").count("* as count").where("ts", ">=", sevenDaysAgo).groupBy("result")
    ]);
    return {
      total: Number(totalResult[0]?.total) || 0,
      byAction: actionStats,
      byResult: resultStats,
      period: "7 days"
    };
  },
  /**
   * Export audit logs as CSV
   */
  async exportCsv(params) {
    const knex = strapi.db.connection;
    const now = /* @__PURE__ */ new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1e3);
    let fromDate = params.from ? new Date(params.from) : defaultFrom;
    let toDate = params.to ? new Date(params.to) : now;
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1e3);
    if (rangeDays > MAX_EXPORT_DAYS) {
      fromDate = new Date(toDate.getTime() - MAX_EXPORT_DAYS * 24 * 60 * 60 * 1e3);
    }
    let query = knex("audit.audit_log_hot").select([
      "id",
      "ts",
      "actor_type",
      "actor_id",
      "action",
      "result",
      "reason_code",
      "target_type",
      "target_id",
      "request_id"
    ]).where("ts", ">=", fromDate).where("ts", "<=", toDate).orderBy("ts", "desc").limit(1e4);
    if (params.action && AUDIT_ACTIONS.includes(params.action)) {
      query = query.where("action", params.action);
    }
    if (params.result && ["success", "fail"].includes(params.result)) {
      query = query.where("result", params.result);
    }
    const data = await query;
    const headers = ["ID", "Timestamp", "Actor Type", "Actor ID", "Action", "Result", "Reason", "Target Type", "Target ID", "Request ID"];
    const rows = data.map((row) => [
      row.id,
      row.ts,
      row.actor_type,
      row.actor_id ?? "",
      row.action,
      row.result,
      row.reason_code ?? "",
      row.target_type ?? "",
      row.target_id ?? "",
      row.request_id ?? ""
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    return csv;
  },
  /**
   * Sanitize row (remove sensitive data, ensure no PII leaks)
   */
  sanitizeRow(row) {
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
      ua: row.ua ? row.ua.substring(0, 100) : null,
      // Truncate UA
      meta: row.meta || {}
      // ip_hash ve sig gösterilmiyor (güvenlik)
    };
  }
});
const services = {
  "audit-viewer": auditViewer
};
const PLUGIN_ID = "audit-viewer";
const isSuperAdmin = async (ctx, config, { strapi }) => {
  const admin = ctx.state?.user;
  if (!admin) {
    strapi.log.warn(`[${PLUGIN_ID}] Access denied: No authenticated admin`);
    return false;
  }
  const isSuperAdmin2 = admin.roles?.some(
    (role) => role.code === "strapi-super-admin" || role.name === "Super Admin"
  );
  if (!isSuperAdmin2) {
    strapi.log.warn(`[${PLUGIN_ID}] Access denied: User ${admin.id} is not SuperAdmin`);
    ctx.forbidden("Only Super Admin can access audit logs");
    return false;
  }
  strapi.log.info(`[${PLUGIN_ID}] Access granted: SuperAdmin ${admin.id} (${admin.email})`);
  return true;
};
const policies = {
  "is-super-admin": isSuperAdmin
};
const index = {
  bootstrap,
  routes,
  controllers,
  services,
  policies
};
module.exports = index;
