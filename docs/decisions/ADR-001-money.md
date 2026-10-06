# ADR-001: Money representation

- **Status:** Accepted (rounding rules pending — see below)
- **Date:** 2026-10-06

## Context

The application computes invoices, GST and ledger postings. Binary floating point
(`number`) cannot represent most decimal fractions exactly (`0.1 + 0.2 !== 0.3`), and small
errors compound across line items, tax splits and ledger totals. Amounts must reconcile to the
paisa between invoices, the ledger and GST returns.

## Decision

1. **Storage and transport:** every monetary amount is an **integer number of paise**
   (1 INR = 100 paise). This applies to the database, IPC between the UI and the Tauri
   backend, server APIs and serialised documents. No floats, no decimal strings in rupees.
2. **Arithmetic:** any calculation that can produce a fractional paisa (tax rates,
   percentage discounts, pro-rating, quantity × rate with fractional quantities or rates)
   is performed with **`decimal.js`**, and converted back to integer paise only at
   explicitly defined rounding points.
3. Plain integer addition/subtraction of paise values may use native integers, provided
   results stay within `Number.MAX_SAFE_INTEGER`.
4. Conversion to rupees (`₹1,234.50`) happens only at the presentation layer.

## To be decided in Phase 1 (`packages/gst-engine`)

- Rounding mode(s) (e.g. half-up vs half-even) and where rounding is applied:
  per line item vs per invoice, per tax head (CGST / SGST / IGST / cess).
- How CGST/SGST splits handle an odd paisa.
- Invoice-level round-off to the nearest rupee and how it is posted to the ledger.
- Precision for quantities and rates (decimal places), and their storage type.
- Whether a branded `Paise` type lives in `packages/types`.

## Consequences

- All money-handling code must go through shared helpers; ad-hoc `number` maths on
  amounts is a review blocker.
- Every rounding point becomes explicit and testable.
