export interface InvoiceLine {
  readonly description: string;
  readonly hsnSac?: string | null;
  readonly qtyX1000: number;
  readonly unit: string;
  readonly ratePaise: number;
  readonly discountPaise: number;
  readonly taxableValuePaise: number;
  readonly cgstBp: number;
  readonly sgstBp: number;
  readonly igstBp: number;
  readonly cessBp: number;
  readonly cgstPaise: number;
  readonly sgstPaise: number;
  readonly igstPaise: number;
  readonly cessPaise: number;
  readonly totalPaise: number;
}

export interface InvoiceRenderInput {
  readonly company: {
    readonly name: string;
    readonly gstin?: string | null;
    readonly address?: string | null;
  };
  readonly customer: {
    readonly name: string;
    readonly gstin?: string | null;
    readonly address?: string | null;
  };
  readonly invoiceNumber: string;
  readonly date: string;
  readonly placeOfSupply: string;
  readonly lines: readonly InvoiceLine[];
  readonly roundOffPaise: number;
  readonly taxableTotalPaise: number;
  readonly cgstTotalPaise: number;
  readonly sgstTotalPaise: number;
  readonly igstTotalPaise: number;
  readonly cessTotalPaise: number;
  readonly grandTotalPaise: number;
  readonly notes?: string | null;
  readonly eInvoiceResponse?: {
    readonly irn: string;
    readonly signedQr?: string | null;
  } | null;
}

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Lakh', 'Crore', 'Arab', 'Kharab', 'Neel'];

function underThousand(value: number): string {
  const parts: string[] = [];
  if (value >= 100) {
    parts.push(`${ONES[Math.floor(value / 100)] ?? ''} Hundred`);
    value %= 100;
  }
  if (value >= 20) {
    parts.push(TENS[Math.floor(value / 10)] ?? '');
    value %= 10;
  }
  if (value > 0) parts.push(ONES[value] ?? '');
  return parts.join(' ');
}

/** Convert integer paise into Indian-numbering currency words. */
export function amountInIndianWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new RangeError('Amount must be a non-negative safe integer number of paise.');
  }
  let rupees = Math.floor(paise / 100);
  const paisePart = paise % 100;
  const groups: number[] = [rupees % 1000];
  rupees = Math.floor(rupees / 1000);
  while (rupees > 0) {
    groups.push(rupees % 100);
    rupees = Math.floor(rupees / 100);
  }
  const rupeeWords = groups
    .map((group, index) =>
      group ? `${underThousand(group)}${SCALES[index] ? ` ${SCALES[index]}` : ''}` : '',
    )
    .filter(Boolean)
    .reverse()
    .join(' ');
  const words = rupeeWords || 'Zero';
  const paiseWords = paisePart ? ` and ${underThousand(paisePart)} Paise` : '';
  return `${words} Rupees${paiseWords} Only`;
}

function escapeHtml(value: string): string {
  const escapes: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(
    /[&<>"']/g,
    (character) => escapes[character] ?? character,
  );
}

function money(paise: number): string {
  const absolute = Math.abs(paise);
  const rupees = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(rupees);
  return `${paise < 0 ? '-' : ''}INR ${formatted}.${cents}`;
}

function rateLabel(bp: number): string {
  return `${(bp / 100).toFixed(2)}%`;
}

function hsnRows(lines: readonly InvoiceLine[]): string {
  const groups = new Map<
    string,
    {
      hsn: string;
      rate: number;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
    }
  >();
  for (const line of lines) {
    const hsn = line.hsnSac || 'Unclassified';
    const rate = line.igstBp || line.cgstBp + line.sgstBp;
    const key = `${hsn}:${rate}:${line.cessBp}`;
    const group = groups.get(key) ?? { hsn, rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    group.taxable += line.taxableValuePaise;
    group.cgst += line.cgstPaise;
    group.sgst += line.sgstPaise;
    group.igst += line.igstPaise;
    group.cess += line.cessPaise;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(
      (group) => `<tr>
		<td>${escapeHtml(group.hsn)}</td><td>${rateLabel(group.rate)}</td>
		<td class="number">${money(group.taxable)}</td><td class="number">${money(group.cgst)}</td>
		<td class="number">${money(group.sgst)}</td><td class="number">${money(group.igst)}</td>
		<td class="number">${money(group.cess)}</td>
	</tr>`,
    )
    .join('');
}

/** Render a self-contained, printable invoice document. IRN and QR are never generated here. */
export function renderInvoiceHtml(input: InvoiceRenderInput): string {
  const lines = input.lines
    .map(
      (line, index) => `<tr>
		<td>${index + 1}</td><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.hsnSac || '')}</td>
		<td class="number">${(line.qtyX1000 / 1000).toFixed(3).replace(/\.?0+$/, '')} ${escapeHtml(line.unit)}</td>
		<td class="number">${money(line.ratePaise)}</td><td class="number">${money(line.discountPaise)}</td>
		<td class="number">${money(line.taxableValuePaise)}</td><td class="number">${money(line.totalPaise)}</td>
	</tr>`,
    )
    .join('');
  const response = input.eInvoiceResponse;
  const irnValue = response?.irn ? escapeHtml(response.irn) : 'Not available';
  const qr = response?.signedQr
    ? `<img class="qr" alt="IRP signed QR code" src="data:image/png;base64,${escapeHtml(response.signedQr)}">`
    : '<span>Not available</span>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(input.invoiceNumber)}</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { color: #18211d; font: 12px/1.45 Arial, sans-serif; margin: 0; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 13px; margin: 18px 0 7px; }
.masthead, .meta, .totals { display: flex; justify-content: space-between; gap: 22px; }
.masthead { border-bottom: 2px solid #28755d; padding-bottom: 12px; }
.meta { padding: 12px 0; } .block { flex: 1; }
.label { color: #5b6862; font-size: 10px; text-transform: uppercase; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d8dfda; padding: 6px; text-align: left; }
th { background: #edf3ef; font-size: 10px; } .number { text-align: right; white-space: nowrap; }
.totals { align-items: flex-start; margin-top: 12px; } .words { flex: 1; }
.summary { min-width: 260px; } .summary td { border: 0; padding: 3px 0; }
.grand { border-top: 1px solid #18211d !important; font-size: 14px; font-weight: bold; }
.e-invoice { border-top: 1px solid #d8dfda; margin-top: 20px; padding-top: 10px; }
.qr { display: block; height: 112px; margin-top: 6px; object-fit: contain; width: 112px; }
.notes { white-space: pre-wrap; } @media print { .screen-only { display: none; } }
</style></head><body>
<header class="masthead"><div><h1>${escapeHtml(input.company.name)}</h1>
<div>${escapeHtml(input.company.address || '')}</div><div>GSTIN: ${escapeHtml(input.company.gstin || 'Not provided')}</div></div>
<div><div class="label">Tax invoice</div><strong>${escapeHtml(input.invoiceNumber)}</strong>
<div>Date: ${escapeHtml(input.date)}</div><div>Place of supply: ${escapeHtml(input.placeOfSupply)}</div></div></header>
<section class="meta"><div class="block"><div class="label">Bill To</div><strong>${escapeHtml(input.customer.name)}</strong>
<div>${escapeHtml(input.customer.address || '')}</div><div>GSTIN: ${escapeHtml(input.customer.gstin || 'Unregistered')}</div></div></section>
<table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="number">Qty</th>
<th class="number">Rate</th><th class="number">Discount</th><th class="number">Taxable</th><th class="number">Line total</th></tr></thead>
<tbody>${lines}</tbody></table>
<h2>HSN summary</h2><table><thead><tr><th>HSN/SAC</th><th>GST rate</th><th class="number">Taxable</th>
<th class="number">CGST</th><th class="number">SGST</th><th class="number">IGST</th><th class="number">Cess</th></tr></thead>
<tbody>${hsnRows(input.lines)}</tbody></table>
<div class="totals"><div class="words"><div class="label">Amount in words</div><strong>${amountInIndianWords(input.grandTotalPaise)}</strong>
${input.notes ? `<h2>Notes</h2><div class="notes">${escapeHtml(input.notes)}</div>` : ''}</div>
<table class="summary"><tbody><tr><td>Taxable value</td><td class="number">${money(input.taxableTotalPaise)}</td></tr>
<tr><td>CGST</td><td class="number">${money(input.cgstTotalPaise)}</td></tr>
<tr><td>SGST</td><td class="number">${money(input.sgstTotalPaise)}</td></tr>
<tr><td>IGST</td><td class="number">${money(input.igstTotalPaise)}</td></tr>
<tr><td>Cess</td><td class="number">${money(input.cessTotalPaise)}</td></tr>
<tr><td>Round-off</td><td class="number">${money(input.roundOffPaise)}</td></tr>
<tr class="grand"><td>Grand total</td><td class="number">${money(input.grandTotalPaise)}</td></tr></tbody></table></div>
<section class="e-invoice"><div class="label">E-invoice details</div><div>IRN: ${irnValue}</div>${qr}</section>
</body></html>`;
}
