import { useEffect, useState } from 'react';
import {
  type AppInitState,
  createCompany,
  formatPaiseToInr,
  initDesktopApp,
  postTestJournal,
  switchCompany,
} from './lib/bridge';
import { SalesScreen } from './SalesScreen';

export function App() {
  const [state, setState] = useState<AppInitState | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'sales' | 'overview'>('sales');

  // New company form modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  useEffect(() => {
    initDesktopApp()
      .then((data) => {
        setState(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, []);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    try {
      setLoading(true);
      setError(null);
      await createCompany(newCompanyName.trim());
      const refreshed = await initDesktopApp();
      setState(refreshed);
      setNewCompanyName('');
      setShowCreateModal(false);
      setNotification(`Created and switched to company "${newCompanyName.trim()}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchCompany = async (companyId: string) => {
    try {
      setLoading(true);
      setError(null);
      await switchCompany(companyId);
      const refreshed = await initDesktopApp();
      setState(refreshed);
      setNotification(`Switched company to ${refreshed.currentCompany.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePostJournal = async () => {
    if (!state) return;
    try {
      setPosting(true);
      setError(null);
      const res = await postTestJournal(state.currentCompany.id, 100_000); // ₹1,000.00
      setState({
        ...state,
        trialBalance: res.trialBalance,
      });
      setNotification(
        `Successfully posted Journal Voucher ${res.docNumber} (Dr Cash ₹1,000 / Cr Capital ₹1,000)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <h2>Connecting to SQLite via Tauri DB Bridge...</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          Verifying WAL mode, foreign keys, and running migrations...
        </p>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="app-container">
        <div className="alert alert-error">
          <span>Failed to initialize database: {error}</span>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const tb = state.trialBalance;
  const isBalanced = tb.totalDebitPaise === tb.totalCreditPaise;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand-section">
          <div className="brand-icon">Q</div>
          <div>
            <h1 className="brand-title">Quadrant Books</h1>
            <p className="brand-subtitle">Offline GST Accounting • Tauri 2 SQLite Bridge</p>
          </div>
        </div>

        <div className="status-pills">
          <div className="pill pill-success">
            <span className="pill-dot" />
            <span>SQLite WAL Mode</span>
          </div>
          <div className="pill">
            <span>Schema v{state.migrationSummary.currentVersion}</span>
          </div>
        </div>
      </header>

      {/* Notifications / Errors */}
      {notification && (
        <div className="alert alert-success">
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Actions Toolbar */}
      <div className="actions-bar">
        <button className="btn btn-secondary" onClick={() => setActiveView('sales')}>
          Sales
        </button>
        <button className="btn btn-secondary" onClick={() => setActiveView('overview')}>
          Overview
        </button>
        <button className="btn btn-primary" onClick={handlePostJournal} disabled={posting}>
          {posting ? 'Posting to DB...' : 'Post Test Journal Voucher (₹1,000)'}
        </button>

        <button className="btn btn-secondary" onClick={() => setShowCreateModal(true)}>
          + New Company
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Company:</span>
          <select
            value={state.currentCompany.id}
            onChange={(e) => handleSwitchCompany(e.target.value)}
            style={{
              background: 'var(--bg-surface-elevated)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 14,
            }}
          >
            {state.allCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.id === state.currentCompany.id ? '(Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeView === 'sales' && <SalesScreen companyId={state.currentCompany.id} />}

      {activeView === 'overview' && (
        <>
          {/* Company Metadata Card */}
          <section className="card">
            <h2 className="card-title">
              <span>Active Company Overview</span>
              <span className="badge badge-income">Connected</span>
            </h2>
            <div className="company-grid">
              <div className="meta-item">
                <span className="meta-label">Company Name</span>
                <span className="meta-value">{state.currentCompany.name}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Financial Year</span>
                <span className="meta-value">2026-27</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Database File</span>
                <span className="meta-value">{state.currentCompany.dbFilename}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Pre-Migration Backups</span>
                <span className="meta-value">AppData/backups/</span>
              </div>
            </div>
          </section>

          {/* Trial Balance Section */}
          <section className="card">
            <h2 className="card-title">
              <span>Trial Balance (as of {tb.asOf})</span>
              <span
                className={`pill ${isBalanced ? 'pill-success' : 'alert-error'}`}
                style={{ margin: 0 }}
              >
                <span
                  className="pill-dot"
                  style={{ background: isBalanced ? 'var(--success)' : 'var(--error)' }}
                />
                <span>{isBalanced ? 'Balanced (Σ Dr = Σ Cr)' : 'Unbalanced'}</span>
              </span>
            </h2>

            {tb.rows.length === 0 ? (
              <div className="empty-state">
                <p>No journal entries posted in this company ledger yet.</p>
                <p style={{ marginTop: 6, fontSize: 13 }}>
                  Click <strong>"Post Test Journal Voucher"</strong> above to write an atomic
                  transaction via PostingService.
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Account Name</th>
                      <th>Nature</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((row) => (
                      <tr key={row.accountId}>
                        <td style={{ fontWeight: 500 }}>{row.name}</td>
                        <td>
                          <span className={`badge badge-${row.nature.toLowerCase()}`}>
                            {row.nature}
                          </span>
                        </td>
                        <td className="text-right">
                          {row.debitPaise > 0 ? formatPaiseToInr(row.debitPaise) : '—'}
                        </td>
                        <td className="text-right">
                          {row.creditPaise > 0 ? formatPaiseToInr(row.creditPaise) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="table-footer">
                      <td colSpan={2}>Grand Total</td>
                      <td className="text-right">{formatPaiseToInr(tb.totalDebitPaise)}</td>
                      <td className="text-right">{formatPaiseToInr(tb.totalCreditPaise)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal for Creating Company */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="card" style={{ width: 440, background: 'var(--bg-surface-elevated)' }}>
            <h3 style={{ marginBottom: 16 }}>Create New Company</h3>
            <form onSubmit={handleCreateCompany}>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 13,
                    marginBottom: 6,
                    color: 'var(--text-muted)',
                  }}
                >
                  Business Name
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Acme Traders Pvt Ltd"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
