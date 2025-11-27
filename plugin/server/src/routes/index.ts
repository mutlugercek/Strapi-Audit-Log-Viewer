// Plugin routes - admin type (only accessible from admin panel)

export default {
  // Admin routes (type: 'admin' - only accessible via admin panel)
  admin: {
    type: 'admin',
    routes: [
      // List audit logs with pagination and filters
      {
        method: 'GET',
        path: '/logs',
        handler: 'audit-viewer.findMany',
        config: {
          policies: ['admin::isAuthenticatedAdmin', 'plugin::audit-viewer.is-super-admin'],
        },
      },
      // Get single audit log detail
      {
        method: 'GET',
        path: '/logs/:id',
        handler: 'audit-viewer.findOne',
        config: {
          policies: ['admin::isAuthenticatedAdmin', 'plugin::audit-viewer.is-super-admin'],
        },
      },
      // Get distinct actions for dropdown
      {
        method: 'GET',
        path: '/actions',
        handler: 'audit-viewer.getActions',
        config: {
          policies: ['admin::isAuthenticatedAdmin', 'plugin::audit-viewer.is-super-admin'],
        },
      },
      // Get audit statistics
      {
        method: 'GET',
        path: '/stats',
        handler: 'audit-viewer.getStats',
        config: {
          policies: ['admin::isAuthenticatedAdmin', 'plugin::audit-viewer.is-super-admin'],
        },
      },
      // Export as CSV
      {
        method: 'GET',
        path: '/export',
        handler: 'audit-viewer.exportCsv',
        config: {
          policies: ['admin::isAuthenticatedAdmin', 'plugin::audit-viewer.is-super-admin'],
        },
      },
    ],
  },
};

