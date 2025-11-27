"use strict";
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
const LazyAuditLogPage = () => Promise.resolve().then(() => require("./AuditLogPage-ju6RRjIY.js"));
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
          const { default: data } = await __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "./translations/en.json": () => Promise.resolve().then(() => require("./en-CHtrDInZ.js")), "./translations/tr.json": () => Promise.resolve().then(() => require("./tr-vu-yEh8o.js")) }), `./translations/${locale}.json`, 3);
          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  }
};
exports.PLUGIN_ID = PLUGIN_ID;
exports.index = index;
