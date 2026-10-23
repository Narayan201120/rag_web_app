import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { UsageResponse, VectorsResponse } from '../types';
import { useToast } from '../state/toast';
import { formatNumber } from '../lib/format';

export function Admin() {
  const toast = useToast();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [vectors, setVectors] = useState<VectorsResponse | null>(null);

  useEffect(() => {
    api.admin
      .usage()
      .then(setUsage)
      .catch((err: Error) => toast.push(err.message, 'error'));
    api.admin
      .vectors()
      .then(setVectors)
      .catch((err: Error) => toast.push(err.message, 'error'));
  }, [toast]);

  const PERIOD_LABELS: Record<string, string> = {
    last_7_days: 'last 7 days',
    last_30_days: 'last 30 days',
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="page-sub">
            Platform usage for {PERIOD_LABELS[usage?.period ?? ''] ?? 'the recent period'}, and the
            state of your vector index.
          </p>
        </div>
      </div>

      {usage && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="num">{formatNumber(usage.total_calls)}</div>
              <div className="lbl">API calls, {PERIOD_LABELS[usage.period] ?? usage.period}</div>
            </div>
            <div className="stat-card">
              <div className="num">{usage.per_user.length}</div>
              <div className="lbl">active users</div>
            </div>
            <div className="stat-card">
              <div className="num">{usage.top_endpoints.length}</div>
              <div className="lbl">endpoints touched</div>
            </div>
          </div>

          <div className="admin-cols">
            <div className="panel" style={{ padding: 0 }}>
              <div style={{ padding: '20px 24px 0' }}>
                <h2>Busiest users</h2>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.per_user.map((row) => (
                      <tr key={row.user__username}>
                        <td>{row.user__username}</td>
                        <td className="mono">{formatNumber(row.call_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ padding: 0 }}>
              <div style={{ padding: '20px 24px 0' }}>
                <h2>Top endpoints</h2>
              </div>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.top_endpoints.map((row) => (
                      <tr key={row.endpoint}>
                        <td className="file-name">{row.endpoint}</td>
                        <td className="mono">{formatNumber(row.call_count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {vectors && (
        <div className="panel" style={{ padding: 0, marginTop: 16 }}>
          <div style={{ padding: '20px 24px 0' }}>
            <h2>Vector index</h2>
            <p className="panel-sub">
              {formatNumber(vectors.total_vectors)} vectors across{' '}
              {formatNumber(vectors.total_documents)} documents, {vectors.embedding_dim} dimensions
              each.
            </p>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Chunks</th>
                  <th>First chunk sample</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(vectors.documents).map(([name, info]) => (
                  <tr key={name}>
                    <td className="file-name">{name}</td>
                    <td className="mono">{info.chunks}</td>
                    <td className="muted small">{info.sample}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
