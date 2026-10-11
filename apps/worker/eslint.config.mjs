import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'src/generated/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/acquisition/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/entrypoints/**',
                '**/database/**',
                '**/decision/**',
                // Parsing services and providers; the pure page parsers in parsing/parsers stay importable.
                '**/parsing/*.ts',
                '**/parsing/document/**',
                '**/parsing/providers/**',
                '**/pipeline/*.service.ts',
                '**/pipeline/*.module.ts',
              ],
              message:
                'Acquisition uses task contracts and injected dependencies; application composition belongs in worker.module.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/pipeline/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/entrypoints/**'],
              message:
                'Entrypoints call the pipeline. Configure transport dependencies in worker.module.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/database/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/entrypoints/**',
                '**/acquisition/**',
                '**/pipeline/*.service.ts',
                '**/pipeline/*.module.ts',
              ],
              message:
                'Database code depends on task/result contracts, not acquisition or entrypoint implementations.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];
