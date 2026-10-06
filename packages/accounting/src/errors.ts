/** Base class for every error the accounting engine raises on purpose. */
export class AccountingError extends Error {
  override name = 'AccountingError';
}

export class UnbalancedJournalError extends AccountingError {
  override name = 'UnbalancedJournalError';
  constructor(
    message: string,
    readonly debitPaise: number,
    readonly creditPaise: number,
  ) {
    super(message);
  }
}

export class DocumentValidationError extends AccountingError {
  override name = 'DocumentValidationError';
}

export class DocumentNotFoundError extends AccountingError {
  override name = 'DocumentNotFoundError';
}

export class AlreadyCancelledError extends AccountingError {
  override name = 'AlreadyCancelledError';
}

export class InvalidAccountError extends AccountingError {
  override name = 'InvalidAccountError';
}

export class PeriodLockedError extends AccountingError {
  override name = 'PeriodLockedError';
  constructor(
    readonly date: string,
    readonly lockedUntil: string,
  ) {
    super(`Books are locked up to ${lockedUntil}; ${date} cannot be posted or cancelled.`);
  }
}

export interface StockShortfall {
  readonly productId: string;
  readonly availableQtyX1000: number;
  readonly requestedQtyX1000: number;
  readonly resultingQtyX1000: number;
}

export class NegativeStockError extends AccountingError {
  override name = 'NegativeStockError';
  constructor(readonly shortfalls: readonly StockShortfall[]) {
    super(`Posting would make stock negative for ${shortfalls.length} product(s).`);
  }
}
