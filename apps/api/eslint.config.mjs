import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
export default [
  { ignores: ['dist/**','src/generated/**'] },js.configs.recommended,...tseslint.configs.recommended,
  {files:['**/*.ts'],rules:{'no-restricted-imports':['error',{patterns:[{group:['@morydeals/worker*','**/worker/**'],message:'API and worker communicate through capture contracts and BullMQ.'}]}]}},
  prettier,
];
