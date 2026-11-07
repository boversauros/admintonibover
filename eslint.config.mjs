import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Runtime boundaries. Server modules also import `server-only`, so a client
  // import of them fails `next build`; these rules add the Lambda code, which
  // cannot carry that marker, and give the error at lint time.
  {
    files: [
      'components/**',
      'lib/api/**',
      'lib/forms/**',
      'lib/hooks/**',
      'lib/auth/AuthContext.tsx',
      'lib/auth/client-session.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/aws/**',
                '!@/lib/aws/backup-contract',
                '@/lib/auth/cognito/**',
                '!@/lib/auth/cognito/groups',
                '@/lib/site-rebuild',
                '@/lib/refresh/**',
                'server-only',
              ],
              allowTypeImports: true,
              message:
                'Browser code may import only types from Lambda and server modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'infra/lambda/**',
      'lib/aws/admin-api/**',
      'lib/aws/build-reader/**',
      'lib/aws/dynamodb/**',
      'lib/aws/media/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/**',
                'react',
                'react/**',
                'server-only',
                '@/components/**',
                '@/lib/api/**',
                '@/lib/auth/AuthContext',
                '@/lib/auth/client-session',
                '@/lib/auth/cognito/**',
                '!@/lib/auth/cognito/groups',
                '@/lib/aws/admin-api-proxy',
                '@/lib/site-rebuild',
              ],
              allowTypeImports: true,
              message:
                'Lambda code runs outside Next.js and may not import Next.js, React or BFF modules.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'infra/generated/**',
  ]),
]);

export default eslintConfig;
