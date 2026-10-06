import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { E_DOC_STATUSES, EINVOICE_DOC_TYPES, EWAYBILL_DOC_TYPES, TRANSPORT_MODES } from './enums';
import { auditColumns, inList, isFinancialYear, pk, timestampMs } from './columns';
import { companies } from './core';

/**
 * Columns shared by e-invoice and e-way bill records. One row per attempt lineage: retries update
 * the row; a fresh row is only needed after FAILED/CANCELLED.
 */
const eDocColumns = () => ({
  id: pk(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  financialYear: text('financial_year').notNull(),
  sourceDocId: text('source_doc_id').notNull(),
  status: text('status', { enum: E_DOC_STATUSES }).notNull().default('PENDING'),
  /** Raw JSON exchanged with the IRP / EWB portal, kept verbatim for audit. */
  requestJson: text('request_json'),
  responseJson: text('response_json'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastAttemptAt: timestampMs('last_attempt_at'),
  cancelReason: text('cancel_reason'),
  cancelledAt: timestampMs('cancelled_at'),
  ...auditColumns(),
});

export const einvoices = sqliteTable(
  'einvoices',
  {
    ...eDocColumns(),
    sourceDocType: text('source_doc_type', { enum: EINVOICE_DOC_TYPES }).notNull(),
    irn: text('irn'),
    ackNo: text('ack_no'),
    /** As returned by the IRP. */
    ackDate: text('ack_date'),
    signedInvoice: text('signed_invoice'),
    signedQr: text('signed_qr'),
  },
  (t) => [
    index('einvoices_company_id_idx').on(t.companyId, t.status),
    index('einvoices_source_idx').on(t.sourceDocType, t.sourceDocId),
    uniqueIndex('einvoices_active_source_uq')
      .on(t.sourceDocType, t.sourceDocId)
      .where(sql`${t.status} NOT IN ('FAILED', 'CANCELLED')`),
    uniqueIndex('einvoices_irn_uq')
      .on(t.irn)
      .where(sql`${t.irn} IS NOT NULL`),
    check('einvoices_fy', isFinancialYear(t.financialYear)),
    check('einvoices_status', inList(t.status, E_DOC_STATUSES)),
    check('einvoices_source_doc_type', inList(t.sourceDocType, EINVOICE_DOC_TYPES)),
    check('einvoices_irn_len', sql`${t.irn} IS NULL OR length(${t.irn}) = 64`),
    check(
      'einvoices_generated_has_irn',
      sql`${t.status} <> 'GENERATED' OR (${t.irn} IS NOT NULL AND ${t.ackNo} IS NOT NULL)`,
    ),
  ],
);

export const ewaybills = sqliteTable(
  'ewaybills',
  {
    ...eDocColumns(),
    sourceDocType: text('source_doc_type', { enum: EWAYBILL_DOC_TYPES }).notNull(),
    einvoiceId: text('einvoice_id').references(() => einvoices.id),
    ewbNo: text('ewb_no'),
    ewbDate: text('ewb_date'),
    validUpto: text('valid_upto'),
    transportMode: text('transport_mode', { enum: TRANSPORT_MODES }),
    vehicleNo: text('vehicle_no'),
    transporterId: text('transporter_id'),
    transporterName: text('transporter_name'),
    transportDocNo: text('transport_doc_no'),
    distanceKm: integer('distance_km'),
  },
  (t) => [
    index('ewaybills_company_id_idx').on(t.companyId, t.status),
    index('ewaybills_source_idx').on(t.sourceDocType, t.sourceDocId),
    index('ewaybills_einvoice_id_idx').on(t.einvoiceId),
    uniqueIndex('ewaybills_active_source_uq')
      .on(t.sourceDocType, t.sourceDocId)
      .where(sql`${t.status} NOT IN ('FAILED', 'CANCELLED')`),
    uniqueIndex('ewaybills_ewb_no_uq')
      .on(t.ewbNo)
      .where(sql`${t.ewbNo} IS NOT NULL`),
    check('ewaybills_fy', isFinancialYear(t.financialYear)),
    check('ewaybills_status', inList(t.status, E_DOC_STATUSES)),
    check('ewaybills_source_doc_type', inList(t.sourceDocType, EWAYBILL_DOC_TYPES)),
    check(
      'ewaybills_transport_mode',
      sql`${t.transportMode} IS NULL OR ${inList(t.transportMode, TRANSPORT_MODES)}`,
    ),
    check('ewaybills_distance', sql`${t.distanceKm} IS NULL OR ${t.distanceKm} >= 0`),
    check('ewaybills_generated_has_no', sql`${t.status} <> 'GENERATED' OR ${t.ewbNo} IS NOT NULL`),
  ],
);
