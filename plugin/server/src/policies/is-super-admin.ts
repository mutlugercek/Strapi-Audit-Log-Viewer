// Policy: Only SuperAdmin can access audit logs
// This is an extra security layer on top of RBAC permissions

import type { Core } from '@strapi/strapi';

const PLUGIN_ID = 'audit-viewer';

export default async (ctx: any, config: any, { strapi }: { strapi: Core.Strapi }) => {
  // Get current admin user
  const admin = ctx.state?.user;

  if (!admin) {
    strapi.log.warn(`[${PLUGIN_ID}] Access denied: No authenticated admin`);
    return false;
  }

  // Check if user has SuperAdmin role
  // In Strapi 5, SuperAdmin has role.code === 'strapi-super-admin'
  const isSuperAdmin = admin.roles?.some(
    (role: any) => role.code === 'strapi-super-admin' || role.name === 'Super Admin'
  );

  if (!isSuperAdmin) {
    strapi.log.warn(`[${PLUGIN_ID}] Access denied: User ${admin.id} is not SuperAdmin`);
    ctx.forbidden('Only Super Admin can access audit logs');
    return false;
  }

  // Log access for audit trail (meta-audit)
  strapi.log.info(`[${PLUGIN_ID}] Access granted: SuperAdmin ${admin.id} (${admin.email})`);

  return true;
};

