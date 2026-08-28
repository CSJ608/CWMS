import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@cwms/kernel': p('./packages/kernel/src/index.ts'),
      '@cwms/contracts': p('./packages/contracts/src/index.ts'),
      '@cwms/core-ledger': p('./packages/core-ledger/src/index.ts'),
      '@cwms/client-registry': p('./packages/client-registry/src/index.ts'),
      '@cwms/plugin-putaway-zone': p('./packages/plugins/putaway-zone/src/index.ts'),
      '@cwms/plugin-putaway-abc': p('./packages/plugins/putaway-abc/src/index.ts'),
      '@cwms/plugin-veto-mixed-lot': p('./packages/plugins/veto-mixed-lot/src/index.ts'),
      '@cwms/feat-inbound': p('./packages/features/feat-inbound/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
})
