// Plugin bootstrap: Register permissions for RBAC

import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'audit-viewer';

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  // Register plugin permissions (RBAC)
  // Only SuperAdmin should have access by default
  const actions = [
    {
      section: 'plugins',
      displayName: 'View Audit Logs',
      uid: 'read',
      pluginName: PLUGIN_ID,
    },
    {
      section: 'plugins',
      displayName: 'Export Audit Logs',
      uid: 'export',
      pluginName: PLUGIN_ID,
    },
  ];

  // Register permissions with Strapi's admin API
  try {
    await strapi.admin?.services?.permission?.actionProvider?.registerMany(actions);
    strapi.log.info(`[${PLUGIN_ID}] Plugin permissions registered`);
  } catch (error: any) {
    strapi.log.warn(`[${PLUGIN_ID}] Failed to register permissions: ${error.message}`);
  }

  strapi.log.info(`[${PLUGIN_ID}] Plugin bootstrapped successfully`);
};

