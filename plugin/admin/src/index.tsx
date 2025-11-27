import { PLUGIN_ID } from './pluginId';

// Lazy load component
const LazyAuditLogPage = () => import('./pages/AuditLogPage');

export default {
  register(app: any) {
    // Register plugin first
    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Audit Viewer',
    });

    // Add menu link with lazy loaded component
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: () => '📋',
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Audit Logs',
      },
      permissions: [
        { action: `plugin::${PLUGIN_ID}.read`, subject: null },
      ],
      Component: async () => {
        const { default: Component } = await LazyAuditLogPage();
        return Component;
      },
    });
  },

  bootstrap() {
    // Empty - routes handled by addMenuLink
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
