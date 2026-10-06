import { invoke } from '@tauri-apps/api/core';

export interface StatementInput {
  readonly sql: string;
  readonly params: readonly unknown[];
}

export interface CompanyInfo {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly dbFilename: string;
  readonly isLastOpened: boolean;
}

export interface DbErrorPayload {
  readonly code: string;
  readonly message: string;
}

export class TauriDbError extends Error {
  readonly code: string;

  constructor(payload: DbErrorPayload | string) {
    if (typeof payload === 'string') {
      super(payload);
      this.code = 'UNKNOWN_DB_ERROR';
    } else {
      super(payload.message);
      this.code = payload.code;
    }
    this.name = 'TauriDbError';
  }
}

function handleIpcError(err: unknown): never {
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err) {
    throw new TauriDbError(err as DbErrorPayload);
  }
  if (typeof err === 'string') {
    throw new TauriDbError(err);
  }
  throw new TauriDbError(String(err));
}

/**
 * Typed IPC wrapper around Tauri 2 invoke calls.
 * UI components must never call invoke() directly.
 */
export const ipc = {
  dbQuery: async (sql: string, params: readonly unknown[] = []): Promise<unknown[][]> => {
    try {
      return await invoke<unknown[][]>('db_query', { sql, params });
    } catch (err) {
      handleIpcError(err);
    }
  },

  dbExecuteBatch: async (statements: readonly StatementInput[]): Promise<number> => {
    try {
      return await invoke<number>('db_execute_batch', { statements });
    } catch (err) {
      handleIpcError(err);
    }
  },

  dbSnapshot: async (dest: string): Promise<void> => {
    try {
      await invoke<void>('db_snapshot', { dest });
    } catch (err) {
      handleIpcError(err);
    }
  },

  companyCreate: async (name: string): Promise<CompanyInfo> => {
    try {
      return await invoke<CompanyInfo>('company_create', { name });
    } catch (err) {
      handleIpcError(err);
    }
  },

  companyOpen: async (companyId: string): Promise<CompanyInfo> => {
    try {
      return await invoke<CompanyInfo>('company_open', { companyId });
    } catch (err) {
      handleIpcError(err);
    }
  },

  companyList: async (): Promise<CompanyInfo[]> => {
    try {
      return await invoke<CompanyInfo[]>('company_list');
    } catch (err) {
      handleIpcError(err);
    }
  },

  companyGetCurrent: async (): Promise<CompanyInfo | null> => {
    try {
      return await invoke<CompanyInfo | null>('company_get_current');
    } catch (err) {
      handleIpcError(err);
    }
  },

  hashPassword: async (password: string): Promise<string> => {
    try {
      return await invoke<string>('hash_password', { password });
    } catch (err) {
      handleIpcError(err);
    }
  },

  verifyPassword: async (password: string, hash: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('verify_password', { password, hash });
    } catch (err) {
      handleIpcError(err);
    }
  },
};

