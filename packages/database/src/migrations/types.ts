export interface Migration {
  /** Position in drizzle-kit's journal; migrations apply in idx order. */
  readonly idx: number;
  readonly tag: string;
  /** sha256 of the .sql file; an applied migration whose file changes is rejected. */
  readonly hash: string;
  readonly statements: readonly string[];
}
