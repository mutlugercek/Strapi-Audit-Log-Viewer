import * as React from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';

interface AuditLog {
  id: number;
  ts: string;
  actor_type: string;
  actor_id: number | null;
  action: string;
  result: string;
  reason_code: string | null;
  target_type: string | null;
  target_id: number | null;
  request_id: string | null;
  ua: string | null;
  meta: Record<string, any>;
}

interface Stats {
  total: number;
  byAction: Array<{ action: string; count: string }>;
  byResult: Array<{ result: string; count: string }>;
  period: string;
}

const formatDate = (ts: string) => {
  return new Date(ts).toLocaleString('tr-TR');
};

const AuditLogPage = () => {
  const { get } = useFetchClient();
  
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(0);
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);
  const [exporting, setExporting] = React.useState(false);
  
  const [filters, setFilters] = React.useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
    action: '',
    result: '',
  });

  // Fetch stats
  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await get(`/${PLUGIN_ID}/stats`);
        setStats(response?.data?.data || null);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };
    fetchStats();
  }, [get]);

  // Fetch logs
  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      });
      
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      if (filters.action) params.append('action', filters.action);
      if (filters.result) params.append('result', filters.result);

      const response = await get(`/${PLUGIN_ID}/logs?${params.toString()}`);
      
      setLogs(response?.data?.data || []);
      setTotal(response?.data?.meta?.pagination?.total || 0);
      setPageCount(response?.data?.meta?.pagination?.pageCount || 1);
    } catch (err: any) {
      console.error('Audit fetch error:', err);
      setError(err?.message || 'Audit logları yüklenirken hata oluştu');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [get, page, filters]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle export
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      if (filters.action) params.append('action', filters.action);

      const response = await get(`/${PLUGIN_ID}/export?${params.toString()}`);
      
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // Styles
  const styles = {
    container: { padding: '32px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', maxWidth: '1400px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
    title: { margin: 0, fontSize: '32px', fontWeight: 600 },
    subtitle: { margin: '8px 0 0', color: '#666' },
    button: { padding: '10px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px' },
    primaryBtn: { background: '#4945ff', color: '#fff' },
    secondaryBtn: { background: '#f0f0ff', color: '#4945ff', border: '1px solid #d9d8ff' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' },
    statCard: { background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
    statLabel: { fontSize: '12px', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
    statValue: { fontSize: '28px', fontWeight: 600, marginTop: '4px' },
    filterBar: { background: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
    filterGrid: { display: 'flex', gap: '16px', flexWrap: 'wrap' as const, alignItems: 'flex-end' },
    filterGroup: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
    label: { fontSize: '12px', fontWeight: 500, color: '#32324d' },
    input: { padding: '10px 12px', border: '1px solid #dcdce4', borderRadius: '4px', fontSize: '14px', minWidth: '160px' },
    select: { padding: '10px 12px', border: '1px solid #dcdce4', borderRadius: '4px', fontSize: '14px', minWidth: '140px', background: '#fff' },
    table: { width: '100%', borderCollapse: 'collapse' as const, background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
    th: { textAlign: 'left' as const, padding: '14px 16px', background: '#f6f6f9', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' as const },
    td: { padding: '14px 16px', borderTop: '1px solid #eaeaef', fontSize: '14px' },
    badge: { display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500 },
    successBadge: { background: '#c6f0c2', color: '#0a5814' },
    failBadge: { background: '#fdd8d8', color: '#a82222' },
    actionBadge: { background: '#e0e0ff', color: '#4945ff' },
    emptyState: { background: '#f6f6f9', borderRadius: '8px', padding: '60px 40px', textAlign: 'center' as const, border: '1px dashed #dcdce4' },
    emptyIcon: { fontSize: '48px', marginBottom: '16px' },
    emptyTitle: { margin: '0 0 8px', color: '#32324d', fontSize: '18px' },
    emptyText: { margin: 0, color: '#666', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' },
    pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#fff', borderTop: '1px solid #eaeaef' },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    modalTitle: { margin: 0, fontSize: '20px', fontWeight: 600 },
    closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' },
    detailGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
    detailItem: { marginBottom: '12px' },
    detailLabel: { fontSize: '12px', color: '#666', marginBottom: '4px' },
    detailValue: { fontSize: '14px', color: '#32324d' },
    metaBox: { background: '#f6f6f9', padding: '12px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap' as const, maxHeight: '200px', overflow: 'auto' },
    loader: { display: 'flex', justifyContent: 'center', padding: '60px' },
    errorBox: { background: '#fdd8d8', border: '1px solid #f5c6cb', borderRadius: '8px', padding: '20px', marginBottom: '24px' },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📋 Audit Logs</h1>
          <p style={styles.subtitle}>Son 90 günlük sistem audit logları (read-only)</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{ ...styles.button, ...styles.secondaryBtn }} onClick={fetchLogs}>
            🔄 Yenile
          </button>
          <button 
            style={{ ...styles.button, ...styles.primaryBtn, opacity: exporting ? 0.7 : 1 }} 
            onClick={handleExport}
            disabled={exporting}
          >
            📥 {exporting ? 'İndiriliyor...' : 'CSV İndir'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Toplam (7 gün)</div>
            <div style={styles.statValue}>{stats.total?.toLocaleString() || 0}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Başarılı</div>
            <div style={{ ...styles.statValue, color: '#0a5814' }}>
              {stats.byResult?.find((r) => r.result === 'success')?.count || 0}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Başarısız</div>
            <div style={{ ...styles.statValue, color: '#a82222' }}>
              {stats.byResult?.find((r) => r.result === 'fail')?.count || 0}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>En Sık Action</div>
            <div style={{ ...styles.statValue, fontSize: '16px' }}>{stats.byAction?.[0]?.action || '-'}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.filterGrid}>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Başlangıç</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Bitiş</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters(f => ({ ...f, action: e.target.value }))}
              style={styles.select}
            >
              <option value="">Tümü</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
              <option value="LOGIN_FAIL_BUCKETED">LOGIN_FAIL_BUCKETED</option>
              <option value="PASSWORD_RESET_REQUEST">PASSWORD_RESET_REQUEST</option>
              <option value="DELETE_REQUESTED">DELETE_REQUESTED</option>
              <option value="DELETE_CONFIRMED">DELETE_CONFIRMED</option>
              <option value="PROFILE_PUBLISH">PROFILE_PUBLISH</option>
              <option value="PROFILE_UNPUBLISH">PROFILE_UNPUBLISH</option>
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Sonuç</label>
            <select
              value={filters.result}
              onChange={(e) => setFilters(f => ({ ...f, result: e.target.value }))}
              style={styles.select}
            >
              <option value="">Tümü</option>
              <option value="success">Başarılı</option>
              <option value="fail">Başarısız</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Hata:</strong> {error}
          <button style={{ ...styles.button, ...styles.secondaryBtn, marginLeft: '16px' }} onClick={fetchLogs}>
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={styles.loader}>
          <div>Yükleniyor...</div>
        </div>
      ) : logs.length === 0 ? (
        /* Empty State */
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📭</div>
          <h3 style={styles.emptyTitle}>Henüz gösterilecek bir kayıt yok</h3>
          <p style={styles.emptyText}>
            Audit logları PostgreSQL <code>audit.audit_log_hot</code> view'ından okunur. 
            Sistem olayları gerçekleştikçe burada görünecektir.
          </p>
        </div>
      ) : (
        /* Table */
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Zaman</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Sonuç</th>
                <th style={styles.th}>Actor</th>
                <th style={styles.th}>Target</th>
                <th style={styles.th}>Request ID</th>
                <th style={styles.th}>Detay</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={styles.td}>{formatDate(log.ts)}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...styles.actionBadge }}>{log.action}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...(log.result === 'success' ? styles.successBadge : styles.failBadge) }}>
                      {log.result === 'success' ? '✓ Başarılı' : '✗ Başarısız'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {log.actor_type}{log.actor_id ? ` #${log.actor_id}` : ''}
                  </td>
                  <td style={styles.td}>
                    {log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '-'}
                  </td>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '11px' }}>
                    {log.request_id ? log.request_id.substring(0, 8) + '...' : '-'}
                  </td>
                  <td style={styles.td}>
                    <button 
                      style={{ ...styles.button, ...styles.secondaryBtn, padding: '6px 12px', fontSize: '12px' }}
                      onClick={() => setSelectedLog(log)}
                    >
                      👁️ Görüntüle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={styles.pagination}>
            <span style={{ color: '#666', fontSize: '14px' }}>
              {total} kayıttan {logs.length} tanesi gösteriliyor
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                style={{ ...styles.button, ...styles.secondaryBtn, padding: '8px 12px' }}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Önceki
              </button>
              <span style={{ padding: '0 12px' }}>Sayfa {page} / {pageCount}</span>
              <button
                style={{ ...styles.button, ...styles.secondaryBtn, padding: '8px 12px' }}
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pageCount}
              >
                Sonraki →
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div style={styles.modal} onClick={() => setSelectedLog(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Audit Log #{selectedLog.id}</h2>
              <button style={styles.closeBtn} onClick={() => setSelectedLog(null)}>×</button>
            </div>
            
            <div style={styles.detailGrid}>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Zaman</div>
                <div style={styles.detailValue}>{formatDate(selectedLog.ts)}</div>
              </div>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Action</div>
                <div><span style={{ ...styles.badge, ...styles.actionBadge }}>{selectedLog.action}</span></div>
              </div>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Sonuç</div>
                <div>
                  <span style={{ ...styles.badge, ...(selectedLog.result === 'success' ? styles.successBadge : styles.failBadge) }}>
                    {selectedLog.result}
                  </span>
                </div>
              </div>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Sebep</div>
                <div style={styles.detailValue}>{selectedLog.reason_code || '-'}</div>
              </div>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Actor</div>
                <div style={styles.detailValue}>
                  {selectedLog.actor_type} {selectedLog.actor_id ? `#${selectedLog.actor_id}` : ''}
                </div>
              </div>
              <div style={styles.detailItem}>
                <div style={styles.detailLabel}>Target</div>
                <div style={styles.detailValue}>
                  {selectedLog.target_type || '-'} {selectedLog.target_id ? `#${selectedLog.target_id}` : ''}
                </div>
              </div>
            </div>

            <div style={{ ...styles.detailItem, marginTop: '16px' }}>
              <div style={styles.detailLabel}>Request ID</div>
              <div style={{ ...styles.detailValue, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {selectedLog.request_id || '-'}
              </div>
            </div>

            <div style={{ ...styles.detailItem, marginTop: '16px' }}>
              <div style={styles.detailLabel}>User Agent</div>
              <div style={{ ...styles.detailValue, fontSize: '12px', wordBreak: 'break-all' }}>
                {selectedLog.ua || '-'}
              </div>
            </div>

            <div style={{ ...styles.detailItem, marginTop: '16px' }}>
              <div style={styles.detailLabel}>Metadata</div>
              <div style={styles.metaBox}>
                {Object.keys(selectedLog.meta || {}).length > 0
                  ? JSON.stringify(selectedLog.meta, null, 2)
                  : 'Metadata yok'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { AuditLogPage };
export default AuditLogPage;
