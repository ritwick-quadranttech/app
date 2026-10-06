import { DocumentValidationError } from './errors';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(date: string, label = 'date'): void {
  const m = ISO_DATE.exec(date);
  const parsed = m ? new Date(`${date}T00:00:00Z`) : undefined;
  if (!m || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DocumentValidationError(`${label} must be a valid YYYY-MM-DD date, got '${date}'.`);
  }
}

/** Financial year code ('2026-27') of a date, for a year starting in `startMonth` (India: 4). */
export function financialYearOf(date: string, startMonth: number): string {
  assertIsoDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= startMonth ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
