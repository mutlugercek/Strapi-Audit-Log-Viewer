/**
 * Request Context Middleware
 * 
 * This middleware prepares context information for each HTTP request:
 * - Request ID (from x-request-id header)
 * - IP Hash (anonymized for privacy)
 * - User Agent (truncated)
 * 
 * Installation:
 * 1. Save this file as src/middlewares/request-context.ts
 * 2. Add 'global::request-context' to config/middlewares.ts
 */

import crypto from 'node:crypto';

// Environment variables
const IP_HASH_SALT = process.env.AUDIT_IP_SALT || 'change-this-salt';
const IDENTIFIER_HASH_SALT = process.env.AUDIT_IDENTIFIER_SALT || 'change-this-id-salt';
const UA_MAX_LENGTH = 300;

/**
 * Anonymizes IP address
 * IPv4: /24 mask (last octet zeroed)
 * IPv6: /48 mask (last 80 bits zeroed)
 */
function maskIp(ip: string): string {
  // IPv4 check
  const ipv4Parts = ip.split('.');
  if (ipv4Parts.length === 4 && ipv4Parts.every(p => /^\d+$/.test(p))) {
    ipv4Parts[3] = '0';
    return ipv4Parts.join('.');
  }
  
  // IPv6 check
  if (ip.includes(':')) {
    try {
      const segments = ip.split(':');
      if (segments.length >= 3) {
        return segments.slice(0, 3).join(':') + ':0:0:0:0:0';
      }
    } catch {
      // Parse error
    }
  }
  
  return ip;
}

/**
 * Hashes IP address (SHA-256)
 */
export function hashIp(ip: string): Buffer {
  const masked = maskIp(ip);
  return crypto.createHash('sha256').update(masked + IP_HASH_SALT).digest();
}

/**
 * Hashes identifier (email, username, etc.)
 */
export function hashIdentifier(identifier: string): Buffer {
  const normalized = String(identifier).trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized + IDENTIFIER_HASH_SALT).digest();
}

/**
 * Truncates User-Agent
 */
export function truncateUa(ua: string | undefined): string | null {
  if (!ua) return null;
  return ua.length > UA_MAX_LENGTH ? ua.substring(0, UA_MAX_LENGTH) : ua;
}

/**
 * Gets client IP (works behind proxy)
 */
export function getClientIp(ctx: any): string {
  // X-Forwarded-For header (behind proxy/load balancer)
  const xff = ctx.request?.headers?.['x-forwarded-for'];
  if (xff) {
    const firstIp = String(xff).split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  
  // X-Real-IP header
  const xri = ctx.request?.headers?.['x-real-ip'];
  if (xri) return String(xri).trim();
  
  // Direct connection
  return ctx.request?.ip || ctx.ip || '0.0.0.0';
}

// Request context interface
export interface RequestContext {
  requestId: string | null;
  clientIp: string;
  ipHash: Buffer;
  ua: string | null;
}

/**
 * Extracts request information from context
 */
export function extractRequestContext(ctx: any): RequestContext {
  const requestId = ctx.request?.headers?.['x-request-id'] || null;
  const clientIp = getClientIp(ctx);
  const ipHash = hashIp(clientIp);
  const ua = truncateUa(ctx.request?.headers?.['user-agent']);
  
  return { requestId, clientIp, ipHash, ua };
}

/**
 * Strapi Middleware Factory
 */
export default (config: any, { strapi }: { strapi: any }) => {
  return async (ctx: any, next: () => Promise<void>) => {
    // Prepare request context
    const reqCtx = extractRequestContext(ctx);
    
    // Add to ctx.state (accessible in all controllers/services)
    ctx.state = ctx.state || {};
    ctx.state.requestContext = reqCtx;
    ctx.state.requestId = reqCtx.requestId;
    ctx.state.ipHash = reqCtx.ipHash;
    ctx.state.ua = reqCtx.ua;
    
    // Add requestId to response header (for debugging)
    if (reqCtx.requestId) {
      ctx.set('x-request-id', reqCtx.requestId);
    }
    
    await next();
  };
};
