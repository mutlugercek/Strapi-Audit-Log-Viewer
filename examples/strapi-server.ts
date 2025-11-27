/**
 * Users-Permissions Extension
 * 
 * This extension adds audit logging to Strapi's users-permissions plugin.
 * 
 * Installation:
 * 1. Save this file as src/extensions/users-permissions/strapi-server.ts
 * 2. Install audit.ts utility
 * 3. Install request-context.ts middleware
 * 
 * Logged events:
 * - Successful login
 * - Failed login (wrong password, deleted account, unverified email)
 * - Password reset request
 * - Password reset confirmation
 */

import { 
  auditLoginSuccess, 
  auditLoginFail, 
  auditPasswordResetRequest, 
  auditPasswordResetConfirm 
} from '../../utils/audit';

const USER_UID = 'plugin::users-permissions.user';

export default (plugin: any) => {
  // Controller object guard
  plugin.controllers = plugin.controllers || {};
  plugin.controllers.auth = plugin.controllers.auth || {};

  // ======================================================
  // LOGIN override
  // ======================================================
  const originalLocal =
    plugin.controllers.auth.local?.bind(plugin.controllers.auth) ||
    plugin.controllers.auth.local;

  plugin.controllers.auth.local = async (ctx: any) => {
    const identifier = ctx.request?.body?.identifier;
    
    try {
      // Call original login controller
      await originalLocal(ctx);

      // Login successful (status 200), perform additional checks
      if (ctx.status === 200 && ctx.body?.user?.id) {
        const userId = ctx.body.user.id;
        const fullUser = await strapi.db.query(USER_UID).findOne({
          where: { id: userId },
          select: ['id', 'verified', 'status', 'token_version'],
        });

        // Soft delete check: Deleted accounts cannot login
        if (fullUser && fullUser.status && fullUser.status !== 'active') {
          await auditLoginFail(strapi, ctx, identifier || 'unknown', 'ACCOUNT_DELETED');
          
          ctx.status = 403;
          ctx.body = {
            error: {
              status: 403,
              message: 'Account has been deleted.',
              code: 'ACCOUNT_DELETED',
            },
          };
          return ctx;
        }

        // Email verified check (optional)
        if (fullUser && fullUser.verified !== true) {
          await auditLoginFail(strapi, ctx, identifier || 'unknown', 'UNCONFIRMED');
          
          ctx.status = 401;
          ctx.body = {
            error: {
              status: 401,
              message: 'Email verification required. Please check your email and verify your account.',
              code: 'UNCONFIRMED',
            },
          };
          return ctx;
        }

        // Add token version to response (for JWT claim - optional)
        if (ctx.body.user) {
          ctx.body.user.tokenVersion = fullUser?.token_version ?? 0;
          ctx.body.user.status = fullUser?.status ?? 'active';
        }

        // Update last_auth_at (optional)
        await strapi.db.query(USER_UID).update({
          where: { id: userId },
          data: { last_auth_at: new Date() },
        });

        // Audit: Successful login
        await auditLoginSuccess(strapi, ctx, userId, { method: 'local' });
      } else {
        // Login failed (status is not 200 or user is missing)
        if (identifier) {
          await auditLoginFail(strapi, ctx, identifier, 'INVALID_CREDENTIALS');
        }
      }

      return ctx;
    } catch (err: any) {
      // Login exception - audit log
      if (identifier) {
        await auditLoginFail(strapi, ctx, identifier, 'LOGIN_ERROR');
      }
      
      throw err;
    }
  };

  // ======================================================
  // FORGOT PASSWORD override
  // ======================================================
  const originalForgotPassword =
    plugin.controllers.auth.forgotPassword?.bind(plugin.controllers.auth) ||
    plugin.controllers.auth.forgotPassword;

  plugin.controllers.auth.forgotPassword = async (ctx: any) => {
    const { email } = ctx.request.body ?? {};
    
    // Find user (if exists) - for audit
    let userId: number | undefined;
    if (email) {
      const normEmail = String(email).trim().toLowerCase();
      const users = await strapi.db.query(USER_UID).findMany({
        where: { email: normEmail },
        limit: 1,
      });
      userId = users?.[0]?.id;
    }

    // Audit log (whether user is found or not)
    await auditPasswordResetRequest(strapi, ctx, userId);

    // Call original controller
    if (typeof originalForgotPassword === 'function') {
      return await originalForgotPassword(ctx);
    }
    
    return ctx;
  };

  // ======================================================
  // RESET PASSWORD override
  // ======================================================
  const originalResetPassword =
    plugin.controllers.auth.resetPassword?.bind(plugin.controllers.auth) ||
    plugin.controllers.auth.resetPassword;

  plugin.controllers.auth.resetPassword = async (ctx: any) => {
    try {
      // Get token (find user before password is changed)
      const { code } = ctx.request.body ?? {};
      
      let userId: number | undefined;
      if (code) {
        const users = await strapi.db.query(USER_UID).findMany({
          where: { resetPasswordToken: code },
          limit: 1,
        });
        userId = users?.[0]?.id;
      }

      // Call original resetPassword controller
      await originalResetPassword(ctx);

      // Successful password reset (status 200)
      if (ctx.status === 200 && userId) {
        await auditPasswordResetConfirm(strapi, ctx, userId);
      }

      return ctx;
    } catch (err: any) {
      throw err;
    }
  };

  return plugin;
};
