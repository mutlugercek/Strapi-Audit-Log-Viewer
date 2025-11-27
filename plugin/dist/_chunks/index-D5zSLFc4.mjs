const __variableDynamicImportRuntimeHelper = (glob, path, segs) => {
  const v = glob[path];
  if (v) {
    return typeof v === "function" ? v() : Promise.resolve(v);
  }
  return new Promise((_, reject) => {
    (typeof queueMicrotask === "function" ? queueMicrotask : setTimeout)(
      reject.bind(
        null,
        new Error(
          "Unknown variable dynamic import: " + path + (path.split("/").length !== segs ? ". Note that variables only represent file names one level deep." : "")
        )
      )
    );
  });
};
const PLUGIN_ID = "audit-viewer";
const LazyAuditLogPage = () => import("./AuditLogPage-BhN1O4xh.mjs");
const index = {
  register(app) {
    app.registerPlugin({
      id: PLUGIN_ID,
      name: "Audit Viewer"
    });
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: () => "📋",
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: "Audit Logs"
      },
      permissions: [
        { action: `plugin::${PLUGIN_ID}.read`, subject: null }
      ],
      Component: async () => {
        const { default: Component } = await LazyAuditLogPage();
        return Component;
      }
    });
  },
  bootstrap() {
  },
  async registerTrads({ locales }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "./translations/en.json": () => import("./en-ul9-G5rz.mjs"), "./translations/tr.json": () => import("./tr-CFE6v5q_.mjs") }), `./translations/${locale}.json`, 3);
          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  }
};
export {
  PLUGIN_ID as P,
  index as i
};
