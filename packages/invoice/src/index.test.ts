import { describe, expect, it } from 'vitest';
import { amountInIndianWords, renderInvoiceHtml, type InvoiceRenderInput } from './index';

describe('@repo/invoice', () => {
  it('writes currency in Indian numbering words', () => {
    expect(amountInIndianWords(12_34_567_89)).toBe(
      'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Eighty Nine Paise Only',
    );
    expect(amountInIndianWords(0)).toBe('Zero Rupees Only');
  });

  it('renders HSN and tax summaries with no locally generated IRN or QR', () => {
    const html = renderInvoiceHtml(invoice);
    expect(html).toContain('HSN summary');
    expect(html).toContain('8471');
    expect(html).toContain('CGST');
    expect(html).toContain('IRN: Not available');
    expect(html).not.toContain('data:image/png;base64,');
  });

  it('escapes invoice text and only renders IRN/QR from an IRP response', () => {
    const html = renderInvoiceHtml({
      ...invoice,
      customer: { ...invoice.customer, name: '<script>alert(1)</script>' },
      eInvoiceResponse: { irn: 'response-irn', signedQr: 'cXJkYXRh' },
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('IRN: response-irn');
    expect(html).toContain('data:image/png;base64,cXJkYXRh');
  });
});

const invoice: InvoiceRenderInput = {
  company: { name: 'Northwind Trading', gstin: '27AAAAA0000A1Z5' },
  customer: { name: 'Customer', gstin: '27BBBBB0000B1Z5' },
  invoiceNumber: 'INV/0001',
  date: '2026-06-18',
  placeOfSupply: '27 Maharashtra',
  lines: [
    {
      description: 'Widget',
      hsnSac: '8471',
      qtyX1000: 1000,
      unit: 'NOS',
      ratePaise: 10000,
      discountPaise: 0,
      taxableValuePaise: 10000,
      cgstBp: 900,
      sgstBp: 900,
      igstBp: 0,
      cessBp: 0,
      cgstPaise: 900,
      sgstPaise: 900,
      igstPaise: 0,
      cessPaise: 0,
      totalPaise: 11800,
    },
  ],
  roundOffPaise: 0,
  taxableTotalPaise: 10000,
  cgstTotalPaise: 900,
  sgstTotalPaise: 900,
  igstTotalPaise: 0,
  cessTotalPaise: 0,
  grandTotalPaise: 11800,
};
