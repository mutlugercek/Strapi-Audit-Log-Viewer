import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import * as React from "react";
import { useFetchClient } from "@strapi/strapi/admin";
import { P as PLUGIN_ID } from "./index-D5zSLFc4.mjs";
const formatDate = (ts) => {
  return new Date(ts).toLocaleString("en-US");
};
const AuditLogPage = () => {
  const { get } = useFetchClient();
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(0);
  const [stats, setStats] = React.useState(null);
  const [selectedLog, setSelectedLog] = React.useState(null);
  const [exporting, setExporting] = React.useState(false);
  const [filters, setFilters] = React.useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
    to: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    action: "",
    result: ""
  });
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await get(`/${PLUGIN_ID}/stats`);
        setStats(response?.data?.data || null);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    };
    fetchStats();
  }, [get]);
  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25"
      });
      if (filters.from) params.append("from", filters.from);
      if (filters.to) params.append("to", filters.to);
      if (filters.action) params.append("action", filters.action);
      if (filters.result) params.append("result", filters.result);
      const response = await get(`/${PLUGIN_ID}/logs?${params.toString()}`);
      setLogs(response?.data?.data || []);
      setTotal(response?.data?.meta?.pagination?.total || 0);
      setPageCount(response?.data?.meta?.pagination?.pageCount || 1);
    } catch (err) {
      console.error("Audit fetch error:", err);
      setError(err?.message || "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [get, page, filters]);
  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.append("from", filters.from);
      if (filters.to) params.append("to", filters.to);
      if (filters.action) params.append("action", filters.action);
      const response = await get(`/${PLUGIN_ID}/export?${params.toString()}`);
      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };
  const styles = {
    container: {
      padding: "32px",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: "1400px",
      margin: "0 auto",
      color: "#32324d"
    },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" },
    title: { margin: 0, fontSize: "32px", fontWeight: 600, color: "#32324d" },
    subtitle: { margin: "8px 0 0", color: "#666" },
    button: { padding: "10px 16px", borderRadius: "4px", border: "none", cursor: "pointer", fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "8px" },
    primaryBtn: { background: "#4945ff", color: "#fff" },
    secondaryBtn: { background: "#f0f0ff", color: "#4945ff", border: "1px solid #d9d8ff" },
    statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" },
    statCard: { background: "#ffffff", padding: "20px", borderRadius: "8px", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", border: "1px solid #eaeaef" },
    statLabel: { fontSize: "12px", color: "#666", textTransform: "uppercase", letterSpacing: "0.5px" },
    statValue: { fontSize: "28px", fontWeight: 600, marginTop: "4px", color: "#32324d" },
    filterBar: { background: "#ffffff", padding: "20px", borderRadius: "8px", marginBottom: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", border: "1px solid #eaeaef" },
    filterGrid: { display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" },
    filterGroup: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontSize: "12px", fontWeight: 500, color: "#32324d" },
    input: { padding: "10px 12px", border: "1px solid #dcdce4", borderRadius: "4px", fontSize: "14px", minWidth: "160px", background: "#fff", color: "#32324d" },
    select: { padding: "10px 12px", border: "1px solid #dcdce4", borderRadius: "4px", fontSize: "14px", minWidth: "140px", background: "#fff", color: "#32324d" },
    table: { width: "100%", borderCollapse: "collapse", background: "#ffffff", borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", border: "1px solid #eaeaef" },
    th: { textAlign: "left", padding: "14px 16px", background: "#f6f6f9", fontSize: "12px", fontWeight: 600, color: "#666", textTransform: "uppercase", borderBottom: "2px solid #eaeaef" },
    td: { padding: "14px 16px", borderTop: "1px solid #eaeaef", fontSize: "14px", color: "#32324d", background: "#ffffff" },
    badge: { display: "inline-block", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 500 },
    successBadge: { background: "#c6f0c2", color: "#0a5814" },
    failBadge: { background: "#fdd8d8", color: "#a82222" },
    actionBadge: { background: "#e0e0ff", color: "#4945ff" },
    emptyState: { background: "#f6f6f9", borderRadius: "8px", padding: "60px 40px", textAlign: "center", border: "1px dashed #dcdce4" },
    emptyIcon: { fontSize: "48px", marginBottom: "16px" },
    emptyTitle: { margin: "0 0 8px", color: "#32324d", fontSize: "18px" },
    emptyText: { margin: 0, color: "#666", maxWidth: "400px", marginLeft: "auto", marginRight: "auto" },
    pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#ffffff", borderTop: "1px solid #eaeaef", color: "#32324d" },
    paginationText: { color: "#666", fontSize: "14px" },
    paginationInfo: { padding: "0 12px", color: "#32324d" },
    modal: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1e3 },
    modalContent: { background: "#ffffff", borderRadius: "8px", padding: "24px", maxWidth: "600px", width: "90%", maxHeight: "80vh", overflow: "auto", color: "#32324d" },
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
    modalTitle: { margin: 0, fontSize: "20px", fontWeight: 600, color: "#32324d" },
    closeBtn: { background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#666" },
    detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
    detailItem: { marginBottom: "12px" },
    detailLabel: { fontSize: "12px", color: "#666", marginBottom: "4px" },
    detailValue: { fontSize: "14px", color: "#32324d" },
    metaBox: { background: "#f6f6f9", padding: "12px", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto", color: "#32324d", border: "1px solid #eaeaef" },
    loader: { display: "flex", justifyContent: "center", padding: "60px", color: "#32324d" },
    errorBox: { background: "#fdd8d8", border: "1px solid #f5c6cb", borderRadius: "8px", padding: "20px", marginBottom: "24px", color: "#a82222" }
  };
  return /* @__PURE__ */ jsxs("div", { style: styles.container, children: [
    /* @__PURE__ */ jsxs("div", { style: styles.header, children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h1", { style: styles.title, children: "📋 Audit Logs" }),
        /* @__PURE__ */ jsx("p", { style: styles.subtitle, children: "Last 90 days system audit logs (read-only)" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "12px" }, children: [
        /* @__PURE__ */ jsx("button", { style: { ...styles.button, ...styles.secondaryBtn }, onClick: fetchLogs, children: "🔄 Refresh" }),
        /* @__PURE__ */ jsxs(
          "button",
          {
            style: { ...styles.button, ...styles.primaryBtn, opacity: exporting ? 0.7 : 1 },
            onClick: handleExport,
            disabled: exporting,
            children: [
              "📥 ",
              exporting ? "Exporting..." : "Export CSV"
            ]
          }
        )
      ] })
    ] }),
    stats && /* @__PURE__ */ jsxs("div", { style: styles.statsGrid, children: [
      /* @__PURE__ */ jsxs("div", { style: styles.statCard, children: [
        /* @__PURE__ */ jsx("div", { style: styles.statLabel, children: "Total (7 days)" }),
        /* @__PURE__ */ jsx("div", { style: styles.statValue, children: stats.total?.toLocaleString() || 0 })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.statCard, children: [
        /* @__PURE__ */ jsx("div", { style: styles.statLabel, children: "Success" }),
        /* @__PURE__ */ jsx("div", { style: { ...styles.statValue, color: "#0a5814" }, children: stats.byResult?.find((r) => r.result === "success")?.count || 0 })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.statCard, children: [
        /* @__PURE__ */ jsx("div", { style: styles.statLabel, children: "Failed" }),
        /* @__PURE__ */ jsx("div", { style: { ...styles.statValue, color: "#a82222" }, children: stats.byResult?.find((r) => r.result === "fail")?.count || 0 })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.statCard, children: [
        /* @__PURE__ */ jsx("div", { style: styles.statLabel, children: "Most Frequent" }),
        /* @__PURE__ */ jsx("div", { style: { ...styles.statValue, fontSize: "16px" }, children: stats.byAction?.[0]?.action || "-" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: styles.filterBar, children: /* @__PURE__ */ jsxs("div", { style: styles.filterGrid, children: [
      /* @__PURE__ */ jsxs("div", { style: styles.filterGroup, children: [
        /* @__PURE__ */ jsx("label", { style: styles.label, children: "Start Date" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "date",
            value: filters.from,
            onChange: (e) => setFilters((f) => ({ ...f, from: e.target.value })),
            style: styles.input
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.filterGroup, children: [
        /* @__PURE__ */ jsx("label", { style: styles.label, children: "End Date" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "date",
            value: filters.to,
            onChange: (e) => setFilters((f) => ({ ...f, to: e.target.value })),
            style: styles.input
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.filterGroup, children: [
        /* @__PURE__ */ jsx("label", { style: styles.label, children: "Action" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: filters.action,
            onChange: (e) => setFilters((f) => ({ ...f, action: e.target.value })),
            style: styles.select,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "All" }),
              /* @__PURE__ */ jsx("option", { value: "LOGIN_SUCCESS", children: "LOGIN_SUCCESS" }),
              /* @__PURE__ */ jsx("option", { value: "LOGIN_FAIL_BUCKETED", children: "LOGIN_FAIL_BUCKETED" }),
              /* @__PURE__ */ jsx("option", { value: "PASSWORD_RESET_REQUEST", children: "PASSWORD_RESET_REQUEST" }),
              /* @__PURE__ */ jsx("option", { value: "DELETE_REQUESTED", children: "DELETE_REQUESTED" }),
              /* @__PURE__ */ jsx("option", { value: "DELETE_CONFIRMED", children: "DELETE_CONFIRMED" }),
              /* @__PURE__ */ jsx("option", { value: "PROFILE_PUBLISH", children: "PROFILE_PUBLISH" }),
              /* @__PURE__ */ jsx("option", { value: "PROFILE_UNPUBLISH", children: "PROFILE_UNPUBLISH" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.filterGroup, children: [
        /* @__PURE__ */ jsx("label", { style: styles.label, children: "Result" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: filters.result,
            onChange: (e) => setFilters((f) => ({ ...f, result: e.target.value })),
            style: styles.select,
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "All" }),
              /* @__PURE__ */ jsx("option", { value: "success", children: "Success" }),
              /* @__PURE__ */ jsx("option", { value: "fail", children: "Failed" })
            ]
          }
        )
      ] })
    ] }) }),
    error && /* @__PURE__ */ jsxs("div", { style: styles.errorBox, children: [
      /* @__PURE__ */ jsx("strong", { children: "Error:" }),
      " ",
      error,
      /* @__PURE__ */ jsx("button", { style: { ...styles.button, ...styles.secondaryBtn, marginLeft: "16px" }, onClick: fetchLogs, children: "Retry" })
    ] }),
    loading ? /* @__PURE__ */ jsx("div", { style: styles.loader, children: /* @__PURE__ */ jsx("div", { children: "Loading..." }) }) : logs.length === 0 ? (
      /* Empty State */
      /* @__PURE__ */ jsxs("div", { style: styles.emptyState, children: [
        /* @__PURE__ */ jsx("div", { style: styles.emptyIcon, children: "📭" }),
        /* @__PURE__ */ jsx("h3", { style: styles.emptyTitle, children: "No records to display" }),
        /* @__PURE__ */ jsxs("p", { style: styles.emptyText, children: [
          "Audit logs are read from PostgreSQL ",
          /* @__PURE__ */ jsx("code", { children: "audit.audit_log_hot" }),
          " view. Records will appear here as system events occur."
        ] })
      ] })
    ) : (
      /* Table */
      /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("table", { style: styles.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Timestamp" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Action" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Result" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Actor" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Target" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Request ID" }),
            /* @__PURE__ */ jsx("th", { style: styles.th, children: "Details" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: logs.map((log) => /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("td", { style: styles.td, children: formatDate(log.ts) }),
            /* @__PURE__ */ jsx("td", { style: styles.td, children: /* @__PURE__ */ jsx("span", { style: { ...styles.badge, ...styles.actionBadge }, children: log.action }) }),
            /* @__PURE__ */ jsx("td", { style: styles.td, children: /* @__PURE__ */ jsx("span", { style: { ...styles.badge, ...log.result === "success" ? styles.successBadge : styles.failBadge }, children: log.result === "success" ? "✓ Success" : "✗ Failed" }) }),
            /* @__PURE__ */ jsxs("td", { style: styles.td, children: [
              log.actor_type,
              log.actor_id ? ` #${log.actor_id}` : ""
            ] }),
            /* @__PURE__ */ jsx("td", { style: styles.td, children: log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ""}` : "-" }),
            /* @__PURE__ */ jsx("td", { style: { ...styles.td, fontFamily: "monospace", fontSize: "11px", color: "#8e8ea9" }, children: log.request_id ? log.request_id.substring(0, 8) + "..." : "-" }),
            /* @__PURE__ */ jsx("td", { style: styles.td, children: /* @__PURE__ */ jsx(
              "button",
              {
                style: { ...styles.button, ...styles.secondaryBtn, padding: "6px 12px", fontSize: "12px" },
                onClick: () => setSelectedLog(log),
                children: "👁️ View"
              }
            ) })
          ] }, log.id)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.pagination, children: [
          /* @__PURE__ */ jsxs("span", { style: styles.paginationText, children: [
            "Showing ",
            logs.length,
            " of ",
            total,
            " records"
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                style: { ...styles.button, ...styles.secondaryBtn, padding: "8px 12px" },
                onClick: () => setPage((p) => Math.max(1, p - 1)),
                disabled: page <= 1,
                children: "← Previous"
              }
            ),
            /* @__PURE__ */ jsxs("span", { style: styles.paginationInfo, children: [
              "Page ",
              page,
              " / ",
              pageCount
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                style: { ...styles.button, ...styles.secondaryBtn, padding: "8px 12px" },
                onClick: () => setPage((p) => p + 1),
                disabled: page >= pageCount,
                children: "Next →"
              }
            )
          ] })
        ] })
      ] })
    ),
    selectedLog && /* @__PURE__ */ jsx("div", { style: styles.modal, onClick: () => setSelectedLog(null), children: /* @__PURE__ */ jsxs("div", { style: styles.modalContent, onClick: (e) => e.stopPropagation(), children: [
      /* @__PURE__ */ jsxs("div", { style: styles.modalHeader, children: [
        /* @__PURE__ */ jsxs("h2", { style: styles.modalTitle, children: [
          "Audit Log #",
          selectedLog.id
        ] }),
        /* @__PURE__ */ jsx("button", { style: styles.closeBtn, onClick: () => setSelectedLog(null), children: "×" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.detailGrid, children: [
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Timestamp" }),
          /* @__PURE__ */ jsx("div", { style: styles.detailValue, children: formatDate(selectedLog.ts) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Action" }),
          /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("span", { style: { ...styles.badge, ...styles.actionBadge }, children: selectedLog.action }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Result" }),
          /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("span", { style: { ...styles.badge, ...selectedLog.result === "success" ? styles.successBadge : styles.failBadge }, children: selectedLog.result }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Reason" }),
          /* @__PURE__ */ jsx("div", { style: styles.detailValue, children: selectedLog.reason_code || "-" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Actor" }),
          /* @__PURE__ */ jsxs("div", { style: styles.detailValue, children: [
            selectedLog.actor_type,
            " ",
            selectedLog.actor_id ? `#${selectedLog.actor_id}` : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: styles.detailItem, children: [
          /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Target" }),
          /* @__PURE__ */ jsxs("div", { style: styles.detailValue, children: [
            selectedLog.target_type || "-",
            " ",
            selectedLog.target_id ? `#${selectedLog.target_id}` : ""
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...styles.detailItem, marginTop: "16px" }, children: [
        /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Request ID" }),
        /* @__PURE__ */ jsx("div", { style: { ...styles.detailValue, fontFamily: "monospace", wordBreak: "break-all" }, children: selectedLog.request_id || "-" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...styles.detailItem, marginTop: "16px" }, children: [
        /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "User Agent" }),
        /* @__PURE__ */ jsx("div", { style: { ...styles.detailValue, fontSize: "12px", wordBreak: "break-all" }, children: selectedLog.ua || "-" })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { ...styles.detailItem, marginTop: "16px" }, children: [
        /* @__PURE__ */ jsx("div", { style: styles.detailLabel, children: "Metadata" }),
        /* @__PURE__ */ jsx("div", { style: styles.metaBox, children: Object.keys(selectedLog.meta || {}).length > 0 ? JSON.stringify(selectedLog.meta, null, 2) : "No metadata" })
      ] })
    ] }) })
  ] });
};
export {
  AuditLogPage,
  AuditLogPage as default
};
