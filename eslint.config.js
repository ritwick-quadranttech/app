// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SQL_KEYWORDS = 'SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|REPLACE|UPSERT|WITH';
const SQL_LITERAL = `/^\\s*(${SQL_KEYWORDS})\\s/i`;

const NO_DB_IN_UI =
  'React components must not touch the database. Go through the Tauri DB bridge / a hook instead.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/desktop/src-tauri/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strict,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // React apps
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}', 'apps/admin/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Tests routinely index rows they just inserted.
  {
    files: ['**/*.test.{ts,tsx}', '**/src/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Architectural boundary: no database package or SQL inside React component files.
  {
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@repo/database',
                '@repo/database/*',
                '**/packages/database',
                '**/packages/database/**',
                '@tauri-apps/plugin-sql',
                'better-sqlite3',
                'sql.js',
                'kysely',
                'kysely/*',
                'drizzle-orm',
                'drizzle-orm/*',
                '*.sql',
                '**/*.sql',
              ],
              message: NO_DB_IN_UI,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TaggedTemplateExpression[tag.name=/^sql$/i]',
          message: `No SQL in React components. ${NO_DB_IN_UI}`,
        },
        {
          selector: 'TaggedTemplateExpression[tag.property.name=/^sql$/i]',
          message: `No SQL in React components. ${NO_DB_IN_UI}`,
        },
        {
          selector: `Literal[value=${SQL_LITERAL}]`,
          message: `No SQL in React components. ${NO_DB_IN_UI}`,
        },
        {
          selector: `TemplateElement[value.raw=${SQL_LITERAL}]`,
          message: `No SQL in React components. ${NO_DB_IN_UI}`,
        },
      ],
    },
  },

  prettier,
);
