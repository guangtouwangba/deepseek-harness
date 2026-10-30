/** Independent Host plugin for read-only Codex subscription quota. */
import { createModels } from '@earendil-works/pi-ai/models'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { codexCredentialStore, createAuthResolver } from './auth.js'
import { registerHost } from './host.js'
import { createMonitor } from './monitor.js'
import { resolveConfig } from './usage.js'

export const name = 'local-openai-usage'
export const inject = ['credentials', 'connection']

/** Reuse provider-owned serialized OAuth refresh; no inference requests or ambient credentials. */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const store = codexCredentialStore(ctx.credentials)
  const models = createModels({
    credentials: store,
    authContext: { env: async () => undefined, fileExists: async () => false },
  })
  models.setProvider(openaiCodexProvider())
  const monitor = createMonitor(config, createAuthResolver(ctx.credentials, models, config))
  registerHost(ctx, {
    ...monitor,
    async dispose() {
      await monitor.dispose()
      await store.dispose()
    },
  })
}
