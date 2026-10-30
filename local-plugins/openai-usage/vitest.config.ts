import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

const require = createRequire(new URL('../../packages/client/ui-sidebar/package.json', import.meta.url))
export default defineConfig({
  plugins: [tsconfigPaths({ projects: [resolve(import.meta.dirname, '../../tsconfig.base.json')] })],
  resolve: { alias: [
    { find: /^react$/, replacement: require.resolve('react') },
    { find: /^react\/jsx-runtime$/, replacement: require.resolve('react/jsx-runtime') },
    { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve('react/jsx-dev-runtime') },
    { find: /^react-dom$/, replacement: require.resolve('react-dom') },
    { find: /^react-dom\/client$/, replacement: require.resolve('react-dom/client') },
  ] },
  test: { include: ['tests/**/*.spec.{ts,tsx}'] },
})
