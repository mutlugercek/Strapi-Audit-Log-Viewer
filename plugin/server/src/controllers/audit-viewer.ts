// Controller: Handle HTTP requests for audit viewer

import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'audit-viewer';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * GET /audit-viewer/logs
   * List audit logs with pagination and filters
   */
  async findMany(ctx: any) {
    try {
      const service = strapi.plugin(PLUGIN_ID).service('audit-viewer');
      
      // Parse query params
      const params = {
        page: ctx.query.page ? parseInt(ctx.query.page, 10) : 1,
        pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize, 10) : 25,
        from: ctx.query.from,
        to: ctx.query.to,
        action: ctx.query.action,
        result: ctx.query.result,
        actorType: ctx.query.actorType,
        actorId: ctx.query.actorId ? parseInt(ctx.query.actorId, 10) : undefined,
        targetType: ctx.query.targetType,
        targetId: ctx.query.targetId ? parseInt(ctx.query.targetId, 10) : undefined,
        requestId: ctx.query.requestId,
      };

      const result = await service.findMany(params);
      
      ctx.body = result;
    } catch (error: any) {
      strapi.log.error(`[${PLUGIN_ID}] findMany error: ${error.message}`);
      ctx.throw(500, 'Failed to fetch audit logs');
    }
  },

  /**
   * GET /audit-viewer/logs/:id
   * Get single audit log detail
   */
  async findOne(ctx: any) {
    try {
      const { id } = ctx.params;
      const numId = parseInt(id, 10);
      
      if (!numId || isNaN(numId)) {
        return ctx.badRequest('Invalid ID');
      }

      const service = strapi.plugin(PLUGIN_ID).service('audit-viewer');
      const result = await service.findOne(numId);
      
      if (!result) {
        return ctx.notFound('Audit log not found');
      }

      ctx.body = { data: result };
    } catch (error: any) {
      strapi.log.error(`[${PLUGIN_ID}] findOne error: ${error.message}`);
      ctx.throw(500, 'Failed to fetch audit log');
    }
  },

  /**
   * GET /audit-viewer/actions
   * Get available actions for dropdown
   */
  async getActions(ctx: any) {
    try {
      const service = strapi.plugin(PLUGIN_ID).service('audit-viewer');
      const actions = service.getActions();
      
      ctx.body = { data: actions };
    } catch (error: any) {
      strapi.log.error(`[${PLUGIN_ID}] getActions error: ${error.message}`);
      ctx.throw(500, 'Failed to fetch actions');
    }
  },

  /**
   * GET /audit-viewer/stats
   * Get audit statistics
   */
  async getStats(ctx: any) {
    try {
      const service = strapi.plugin(PLUGIN_ID).service('audit-viewer');
      const stats = await service.getStats();
      
      ctx.body = { data: stats };
    } catch (error: any) {
      strapi.log.error(`[${PLUGIN_ID}] getStats error: ${error.message}`);
      ctx.throw(500, 'Failed to fetch statistics');
    }
  },

  /**
   * GET /audit-viewer/export
   * Export audit logs as CSV
   */
  async exportCsv(ctx: any) {
    try {
      const service = strapi.plugin(PLUGIN_ID).service('audit-viewer');
      
      // Parse query params
      const params = {
        from: ctx.query.from,
        to: ctx.query.to,
        action: ctx.query.action,
        result: ctx.query.result,
      };

      const csv = await service.exportCsv(params);
      
      // Set headers for CSV download
      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      ctx.set('Content-Type', 'text/csv; charset=utf-8');
      ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      ctx.body = csv;
    } catch (error: any) {
      strapi.log.error(`[${PLUGIN_ID}] exportCsv error: ${error.message}`);
      ctx.throw(500, 'Failed to export audit logs');
    }
  },
});

