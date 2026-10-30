/** One plugin-instance owner for cached quota and in-flight reads across browser viewers. */
import { readUsage } from './usage.js'

/** Coalesce viewers, bound refresh rate and quiesce all work before unload completes. */
export function createMonitor(config, resolveAuth, fetcher = fetch) {
  const lifetime = new AbortController()
  let generation = 0
  let cached
  let expiresAt = 0
  let pending
  const invalidate = () => { generation++; cached = undefined; expiresAt = 0 }
  const read = async () => {
    lifetime.signal.throwIfAborted()
    if (cached !== undefined && Date.now() < expiresAt) return cached
    if (pending !== undefined) return pending
    let admittedGeneration = generation
    pending = readUsage(config, async signal => {
      const auth = await resolveAuth(signal)
      admittedGeneration = generation
      return auth
    }, lifetime.signal, fetcher).then(value => {
      lifetime.signal.throwIfAborted()
      if (generation !== admittedGeneration) return { status: 'signed-out', code: 'auth-required', refreshIntervalMs: config.refreshIntervalMs }
      cached = value
      expiresAt = Date.now() + config.refreshIntervalMs
      return value
    }).finally(() => { pending = undefined })
    return pending
  }
  return {
    read, invalidate,
    async dispose() {
      lifetime.abort()
      await Promise.allSettled(pending === undefined ? [] : [pending])
      cached = undefined
    },
  }
}
