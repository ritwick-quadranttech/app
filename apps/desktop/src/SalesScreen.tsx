import { useEffect, useState } from 'react';
import { STATE_CODES } from '@repo/gst-engine';
import type { SalesInvoiceInput } from '@repo/accounting';
import { formatPaiseToInr } from './lib/bridge';
import {
  cancelSalesInvoice,
  invoiceFinancialYear,
  loadSalesInvoiceDraft,
  loadSalesWorkspace,
  postSalesInvoice,
  replaceSalesInvoice,
  renderSalesInvoice,
  setCompanyEInvoiceEnabled,
  type SalesWorkspace,
} from './lib/sales';
import { calculateSalesPreview, parseInvoicePaise, parseInvoiceQty } from './lib/sales-calculation';
import './sales.css';

type DiscountMode = 'PERCENT' | 'AMOUNT';
type DraftLine = {
  readonly productId: string;
  readonly qty: string;
  readonly rate: string;
  readonly discountMode: DiscountMode;
  readonly discount: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const newLine = (): DraftLine => ({
  productId: '',
  qty: '1',
  rate: '',
  discountMode: 'PERCENT',
  discount: '0',
});
const blankDraft = () => ({
  date: today(),
  partyId: '',
  placeOfSupply: '',
  seriesId: '',
  paymentMethod: 'CREDIT',
  paymentStatus: 'UNPAID',
  cashBankAccountId: '',
  roundOff: '0.00',
  notes: '',
  lines: [newLine()],
});

function paiseInput(paise: number): string {
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

function qtyInput(qtyX1000: number): string {
  return (qtyX1000 / 1000).toFixed(3).replace(/\.?0+$/, '');
}

export function SalesScreen({ companyId }: { readonly companyId: string }) {
  const [workspace, setWorkspace] = useState<SalesWorkspace | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState(false);
  const [tab, setTab] = useState<'invoice' | 'list'>('invoice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  async function refresh() {
    setWorkspace(await loadSalesWorkspace(companyId));
  }

  useEffect(() => {
    setWorkspace(null);
    setError(null);
    loadSalesWorkspace(companyId)
      .then(setWorkspace)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [companyId]);

  useEffect(() => {
    if (!workspace || draft.placeOfSupply) return;
    const customer = workspace.customers.find((item) => item.id === draft.partyId);
    setDraft((current) => ({
      ...current,
      placeOfSupply: customer?.stateCode || workspace.company.stateCode,
      seriesId:
        current.seriesId ||
        workspace.series.find((series) => series.isDefault)?.id ||
        workspace.series[0]?.id ||
        '',
    }));
  }, [workspace, draft.partyId, draft.placeOfSupply]);

  const customer = workspace?.customers.find((item) => item.id === draft.partyId);
  const financialYear = workspace
    ? invoiceFinancialYear(draft.date, workspace.company.fyStartMonth)
    : '';
  const series = workspace?.series.find(
    (item) => item.id === draft.seriesId && item.financialYear === financialYear,
  );
  const isInterstate = Boolean(
    workspace && draft.placeOfSupply && draft.placeOfSupply !== workspace.company.stateCode,
  );
  const preview = calculateSalesPreview({
    lines: draft.lines,
    products: workspace?.products ?? [],
    taxRates: workspace?.taxRates ?? [],
    date: draft.date,
    interstate: isInterstate,
    roundOff: draft.roundOff,
  });
  const calculationRows = preview.rows;
  const totals = preview.totals;
  const totalsError = preview.error;
  const roundOffPaise = preview.roundOffPaise;
  const validLines = calculationRows.flatMap((row) => (row.result ? [row.result] : []));
  const selectedLineCount = draft.lines.filter((line) => line.productId).length;
  const hasCalculationErrors = calculationRows.some((row) => row.error !== null);
  const canPost = Boolean(
    workspace &&
    customer &&
    selectedLineCount > 0 &&
    validLines.length === selectedLineCount &&
    !hasCalculationErrors &&
    !totalsError &&
    series &&
    !busy &&
    (draft.paymentMethod !== 'CREDIT' || draft.paymentStatus === 'UNPAID') &&
    (draft.paymentStatus !== 'PAID' || Boolean(draft.cashBankAccountId)),
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function updateDraft<K extends keyof ReturnType<typeof blankDraft>>(
    key: K,
    value: ReturnType<typeof blankDraft>[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function clearDraft() {
    setDraft({
      ...blankDraft(),
      placeOfSupply: workspace?.company.stateCode ?? '',
      seriesId: workspace?.series.find((item) => item.isDefault)?.id ?? '',
    });
    setEditingId(null);
    setSavedDraft(false);
  }

  function handleSaveDraft() {
    try {
      localStorage.setItem(`sales-draft:${companyId}`, JSON.stringify(draft));
      setSavedDraft(true);
      setNotice('Draft saved on this device. No invoice number has been allocated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this draft on the device.');
    }
  }

  function handleRestoreDraft() {
    try {
      const stored = localStorage.getItem(`sales-draft:${companyId}`);
      if (!stored) return setError('No saved draft is available for this company.');
      const parsed = JSON.parse(stored) as ReturnType<typeof blankDraft>;
      if (!Array.isArray(parsed.lines) || typeof parsed.date !== 'string')
        throw new Error('Saved draft is invalid.');
      setDraft(parsed);
      setEditingId(null);
      setTab('invoice');
      setNotice('Draft restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function invoiceInput(): SalesInvoiceInput {
    if (!workspace || !customer || !series)
      throw new Error('Choose a customer, invoice date, and number series.');
    const lines = calculationRows.flatMap((row) => {
      if (!row.product || !row.result) return [];
      return [
        {
          productId: row.product.id,
          unitId: row.product.unitId,
          ...(row.product.hsnSac ? { hsnSac: row.product.hsnSac } : {}),
          qtyX1000: parseInvoiceQty(row.line.qty),
          ratePaise: parseInvoicePaise(row.line.rate),
          discountPaise: row.result.discountPaise,
          taxableValuePaise: row.result.taxableValuePaise,
          cgstBp: isInterstate ? 0 : (row.rate?.cgstBp ?? 0),
          sgstBp: isInterstate ? 0 : (row.rate?.sgstBp ?? 0),
          igstBp: isInterstate ? (row.rate?.igstBp ?? 0) : 0,
          cessBp: row.rate?.cessBp ?? 0,
          cgstPaise: row.result.cgstPaise,
          sgstPaise: row.result.sgstPaise,
          igstPaise: row.result.igstPaise,
          cessPaise: row.result.cessPaise,
        },
      ];
    });
    return {
      companyId,
      seriesId: series.id,
      date: draft.date,
      partyId: customer.id,
      placeOfSupply: draft.placeOfSupply,
      igstApplicable: isInterstate,
      roundOffPaise,
      notes: draft.notes,
      lines,
      paymentMethod: draft.paymentMethod as NonNullable<SalesInvoiceInput['paymentMethod']>,
      paymentStatus: draft.paymentStatus as NonNullable<SalesInvoiceInput['paymentStatus']>,
      ...(draft.paymentStatus === 'PAID' && draft.cashBankAccountId
        ? { cashBankAccountId: draft.cashBankAccountId }
        : {}),
    };
  }

  async function handlePost() {
    if (!canPost || !workspace) return;
    setBusy(true);
    setError(null);
    try {
      const input = invoiceInput();
      const posted = editingId
        ? await replaceSalesInvoice(editingId, input)
        : await postSalesInvoice(input);
      localStorage.removeItem(`sales-draft:${companyId}`);
      setNotice(`${editingId ? 'Invoice replaced with' : 'Posted'} ${posted.docNumber}.`);
      clearDraft();
      await refresh();
      setTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(invoiceId: string) {
    setBusy(true);
    setError(null);
    try {
      const saved = await loadSalesInvoiceDraft(invoiceId);
      setDraft({
        date: saved.date,
        partyId: saved.partyId,
        placeOfSupply: saved.placeOfSupply,
        seriesId: saved.seriesId,
        paymentMethod: saved.paymentMethod,
        paymentStatus: saved.paymentStatus,
        cashBankAccountId: saved.cashBankAccountId,
        roundOff: paiseInput(saved.roundOffPaise),
        notes: saved.notes,
        lines: saved.lines.map((line) => ({
          productId: line.productId,
          qty: qtyInput(line.qtyX1000),
          rate: paiseInput(line.ratePaise),
          discountMode: 'AMOUNT' as const,
          discount: paiseInput(line.discountPaise),
        })),
      });
      setEditingId(invoiceId);
      setSavedDraft(false);
      setTab('invoice');
      setNotice('Editing creates a cancellation reversal and a new invoice number when posted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSalesInvoice(cancelTarget, cancelReason);
      setNotice('Invoice cancelled. Journal, stock, and GST reversals were posted.');
      setCancelTarget(null);
      setCancelReason('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint(invoiceId: string) {
    setError(null);
    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow)
        throw new Error('The print window was blocked. Allow pop-ups for this app and retry.');
      const html = await renderSalesInvoice(invoiceId);
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleEInvoice(enabled: boolean) {
    if (!workspace) return;
    try {
      await setCompanyEInvoiceEnabled(companyId, enabled);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!workspace)
    return (
      <section className="sales-loading">
        {error ? `Sales unavailable: ${error}` : 'Loading sales data...'}
      </section>
    );

  const visibleInvoices = workspace.invoices.filter(
    (invoice) =>
      (statusFilter === 'ALL' || invoice.status === statusFilter) &&
      (!dateFrom || invoice.date >= dateFrom) &&
      (!dateTo || invoice.date <= dateTo) &&
      `${invoice.docNumber} ${invoice.partyName}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="sales-workspace">
      <div className="sales-heading">
        <div>
          <div className="sales-kicker">Revenue / Outward supplies</div>
          <h2>Sales invoices</h2>
        </div>
        <div className="sales-heading-actions">
          <label className="sales-toggle">
            <input
              type="checkbox"
              checked={workspace.company.einvoiceEnabled}
              onChange={(event) => toggleEInvoice(event.target.checked)}
            />
            <span>e-invoicing enabled</span>
          </label>
          <div className="sales-tabs" role="tablist" aria-label="Sales views">
            <button className={tab === 'invoice' ? 'active' : ''} onClick={() => setTab('invoice')}>
              Invoice
            </button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
              Register
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="sales-alert error" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="sales-alert success" role="status">
          {notice}
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {tab === 'invoice' ? (
        <>
          <div className="sales-form-grid">
            <div className="sales-form">
              <div className="sales-form-title">
                <div>
                  <span className="sales-kicker">
                    {editingId ? 'Posted invoice correction' : 'Unposted draft'}
                  </span>
                  <h3>{editingId ? 'Edit invoice' : 'New tax invoice'}</h3>
                </div>
                {editingId && (
                  <button className="sales-button quiet" onClick={clearDraft}>
                    Exit edit
                  </button>
                )}
              </div>
              <div className="sales-fields invoice-meta-fields">
                <label>
                  Customer
                  <select
                    value={draft.partyId}
                    onChange={(event) => {
                      const selected = workspace.customers.find(
                        (item) => item.id === event.target.value,
                      );
                      setDraft((current) => ({
                        ...current,
                        partyId: event.target.value,
                        placeOfSupply: selected?.stateCode || workspace.company.stateCode,
                      }));
                    }}
                  >
                    <option value="">Select customer</option>
                    {workspace.customers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.gstin ? ` · ${item.gstin}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Invoice date
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => updateDraft('date', event.target.value)}
                  />
                </label>
                <label>
                  Invoice series
                  <select
                    value={draft.seriesId}
                    onChange={(event) => updateDraft('seriesId', event.target.value)}
                  >
                    {workspace.series.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.financialYear}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Invoice number
                  <input
                    readOnly
                    value={
                      series
                        ? `${series.prefix}${String(series.nextNo).padStart(series.padWidth, '0')}${series.suffix}`
                        : 'Choose a series for this financial year'
                    }
                  />
                  <small>
                    Allocated atomically on posting; failed posts do not consume a number.
                  </small>
                </label>
                <label>
                  Place of supply
                  <select
                    value={draft.placeOfSupply}
                    onChange={(event) => updateDraft('placeOfSupply', event.target.value)}
                  >
                    {Object.entries(STATE_CODES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} · {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Customer GSTIN
                  <input readOnly value={customer?.gstin || 'Unregistered'} />
                </label>
              </div>

              <div className="sales-lines-header">
                <h4>Items</h4>
                <button
                  className="sales-button quiet"
                  onClick={() =>
                    setDraft((current) => ({ ...current, lines: [...current.lines, newLine()] }))
                  }
                >
                  Add line
                </button>
              </div>
              <div className="sales-table-wrap">
                <table className="sales-lines-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Rate (INR)</th>
                      <th>Discount</th>
                      <th>Taxable</th>
                      <th>CGST</th>
                      <th>SGST</th>
                      <th>IGST</th>
                      <th>Cess</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, index) => {
                      const computed = calculationRows[index];
                      if (!computed) return null;
                      const product = computed.product;
                      const unit = workspace.units.find((item) => item.id === product?.unitId);
                      return (
                        <tr key={index}>
                          <td>
                            <select
                              aria-label="Product"
                              value={line.productId}
                              onChange={(event) => {
                                const chosen = workspace.products.find(
                                  (item) => item.id === event.target.value,
                                );
                                updateLine(index, {
                                  productId: event.target.value,
                                  rate:
                                    chosen?.saleRatePaise == null
                                      ? ''
                                      : paiseInput(chosen.saleRatePaise),
                                });
                              }}
                            >
                              <option value="">Choose product</option>
                              {workspace.products.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                            {computed.error && (
                              <small className="line-error">{computed.error}</small>
                            )}
                          </td>
                          <td>
                            <input
                              aria-label="Quantity"
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.qty}
                              onChange={(event) => updateLine(index, { qty: event.target.value })}
                            />
                          </td>
                          <td>{unit?.code || '—'}</td>
                          <td>
                            <input
                              aria-label="Rate in rupees"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.rate}
                              onChange={(event) => updateLine(index, { rate: event.target.value })}
                            />
                          </td>
                          <td className="discount-cell">
                            <select
                              aria-label="Discount type"
                              value={line.discountMode}
                              onChange={(event) =>
                                updateLine(index, {
                                  discountMode: event.target.value as DiscountMode,
                                  discount: '0',
                                })
                              }
                            >
                              <option value="PERCENT">%</option>
                              <option value="AMOUNT">INR</option>
                            </select>
                            <input
                              aria-label="Discount value"
                              type="number"
                              min="0"
                              step={line.discountMode === 'PERCENT' ? '0.01' : '0.01'}
                              value={line.discount}
                              onChange={(event) =>
                                updateLine(index, { discount: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            {computed.result
                              ? formatPaiseToInr(computed.result.taxableValuePaise)
                              : '—'}
                          </td>
                          <td>
                            {computed.result ? formatPaiseToInr(computed.result.cgstPaise) : '—'}
                          </td>
                          <td>
                            {computed.result ? formatPaiseToInr(computed.result.sgstPaise) : '—'}
                          </td>
                          <td>
                            {computed.result ? formatPaiseToInr(computed.result.igstPaise) : '—'}
                          </td>
                          <td>
                            {computed.result ? formatPaiseToInr(computed.result.cessPaise) : '—'}
                          </td>
                          <td className="line-total">
                            {computed.result ? formatPaiseToInr(computed.result.totalPaise) : '—'}
                          </td>
                          <td>
                            <button
                              className="remove-line"
                              aria-label="Remove line"
                              title="Remove line"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  lines:
                                    current.lines.length === 1
                                      ? [newLine()]
                                      : current.lines.filter((_, row) => row !== index),
                                }))
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sales-fields footer-fields">
                <label>
                  Payment method
                  <select
                    value={draft.paymentMethod}
                    onChange={(event) => updateDraft('paymentMethod', event.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CREDIT">Credit</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label>
                  Payment status
                  <select
                    value={draft.paymentStatus}
                    onChange={(event) => updateDraft('paymentStatus', event.target.value)}
                  >
                    <option value="PAID">Paid</option>
                    <option value="UNPAID">Unpaid</option>
                  </select>
                </label>
                {draft.paymentStatus === 'PAID' && (
                  <label>
                    Cash / bank account
                    <select
                      value={draft.cashBankAccountId}
                      onChange={(event) => updateDraft('cashBankAccountId', event.target.value)}
                    >
                      <option value="">Select ledger</option>
                      {workspace.paymentAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Round-off (INR)
                  <input
                    type="number"
                    step="0.01"
                    value={draft.roundOff}
                    onChange={(event) => updateDraft('roundOff', event.target.value)}
                  />
                </label>
                <label className="notes-field">
                  Notes
                  <textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(event) => updateDraft('notes', event.target.value)}
                  />
                </label>
              </div>
            </div>

            <aside className="sales-summary">
              <div className="sales-kicker">
                Live calculation · {isInterstate ? 'IGST' : 'CGST + SGST'}
              </div>
              <h3>Invoice total</h3>
              <dl>
                <div>
                  <dt>Taxable value</dt>
                  <dd>{formatPaiseToInr(totals.taxableValuePaise)}</dd>
                </div>
                <div>
                  <dt>CGST</dt>
                  <dd>{formatPaiseToInr(totals.cgstPaise)}</dd>
                </div>
                <div>
                  <dt>SGST</dt>
                  <dd>{formatPaiseToInr(totals.sgstPaise)}</dd>
                </div>
                <div>
                  <dt>IGST</dt>
                  <dd>{formatPaiseToInr(totals.igstPaise)}</dd>
                </div>
                <div>
                  <dt>Cess</dt>
                  <dd>{formatPaiseToInr(totals.cessPaise)}</dd>
                </div>
                <div>
                  <dt>Round-off</dt>
                  <dd>{formatPaiseToInr(roundOffPaise)}</dd>
                </div>
              </dl>
              <div className="grand-total">
                <span>Grand total</span>
                <strong>{formatPaiseToInr(totals.grandTotalPaise)}</strong>
              </div>
              {(totalsError ||
                calculationRows.some((row) => row.error) ||
                (workspace.company.lockedUntil && draft.date <= workspace.company.lockedUntil)) && (
                <div className="sales-validation">
                  {totalsError ||
                    calculationRows.find((row) => row.error)?.error ||
                    `Period locked through ${workspace.company.lockedUntil}`}
                </div>
              )}
              {series && (
                <p className="numbering-note">
                  Next: {series.prefix}
                  {String(series.nextNo).padStart(series.padWidth, '0')}
                  {series.suffix} · {financialYear}
                </p>
              )}
              <div className="sales-actions">
                <button className="sales-button secondary" onClick={handleSaveDraft}>
                  Save draft
                </button>
                <button
                  className="sales-button primary"
                  disabled={
                    !canPost ||
                    Boolean(
                      workspace.company.lockedUntil && draft.date <= workspace.company.lockedUntil,
                    )
                  }
                  onClick={handlePost}
                >
                  {busy ? 'Posting…' : editingId ? 'Cancel + repost' : 'Post invoice'}
                </button>
                <button className="sales-button quiet" onClick={handleRestoreDraft}>
                  Restore saved draft
                </button>
                <button className="sales-button quiet" onClick={clearDraft}>
                  Clear form
                </button>
                {savedDraft && <small>Draft saved locally · number not allocated</small>}
              </div>
              {!workspace.customers.length && (
                <p className="sales-empty-hint">
                  Create a customer in Masters before issuing an invoice.
                </p>
              )}
              {!workspace.products.length && (
                <p className="sales-empty-hint">
                  Create products or services in Masters before issuing an invoice.
                </p>
              )}
            </aside>
          </div>
        </>
      ) : (
        <div className="sales-register">
          <div className="register-filters">
            <label>
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Invoice or customer"
              />
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="ALL">All</option>
                <option value="POSTED">Posted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
          </div>
          <div className="sales-table-wrap">
            <table className="register-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>e-Invoice</th>
                  <th>Status</th>
                  <th className="number">Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="invoice-number">{invoice.docNumber}</td>
                    <td>{invoice.date}</td>
                    <td>{invoice.partyName}</td>
                    <td>
                      {invoice.paymentMethod} · {invoice.paymentStatus}
                    </td>
                    <td>{invoice.einvoiceStatus}</td>
                    <td>
                      <span className={`invoice-status ${invoice.status.toLowerCase()}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="number">{formatPaiseToInr(invoice.grandTotalPaise)}</td>
                    <td className="row-actions">
                      <button onClick={() => handlePrint(invoice.id)}>Print / PDF</button>
                      {invoice.status === 'POSTED' && (
                        <>
                          <button onClick={() => startEdit(invoice.id)}>Edit</button>
                          <button
                            className="danger-action"
                            onClick={() => setCancelTarget(invoice.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleInvoices.length && (
              <div className="register-empty">No invoices match these filters.</div>
            )}
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="sales-modal-backdrop" role="presentation">
          <section
            className="sales-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-heading"
          >
            <h3 id="cancel-heading">Cancel invoice</h3>
            <p>This posts exact journal, stock, and GST reversals. A reason is required.</p>
            <label>
              Reason
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                autoFocus
              />
            </label>
            <div>
              <button className="sales-button quiet" onClick={() => setCancelTarget(null)}>
                Keep invoice
              </button>
              <button
                className="sales-button danger"
                disabled={!cancelReason.trim() || busy}
                onClick={handleCancel}
              >
                Confirm cancellation
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
