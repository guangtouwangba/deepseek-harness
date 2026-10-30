/** Shared request ownership and cache lifecycle. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMonitor } from '../monitor.js'
import { resolveConfig } from '../usage.js'
const fixture = { plan_type: 'plus', rate_limit: { secondary_window: { used_percent: 25, limit_window_seconds: 604800, reset_at: 1793876400 } } }
const auth = async () => ({ provider: 'openai-codex', accessToken: 'private', accountId: 'account' })

test('concurrent viewers share one request and recent quota is cached', async () => {
  let requests = 0
  const monitor = createMonitor(resolveConfig({}), auth, async () => { requests++; return Response.json(fixture) })
  const [a, b] = await Promise.all([monitor.read(), monitor.read()])
  assert.deepEqual(a, b)
  assert.equal(a.weekly.remainingPercent, 75)
  await monitor.read()
  assert.equal(requests, 1)
  monitor.invalidate()
  await monitor.read()
  assert.equal(requests, 2)
  await monitor.dispose()
})

test('logout invalidates in-flight results but refresh inside authentication can finish', async () => {
  let release
  const monitor = createMonitor(resolveConfig({}), auth, () => new Promise(resolve => { release = resolve }))
  const read = monitor.read()
  while (!release) await Promise.resolve()
  monitor.invalidate()
  release(Response.json(fixture))
  assert.equal((await read).status, 'signed-out')
  await monitor.dispose()
  let own
  own = createMonitor(resolveConfig({}), async () => { own.invalidate(); return auth() }, async () => Response.json(fixture))
  assert.equal((await own.read()).status, 'ready')
  await own.dispose()
})

test('unload aborts and awaits outstanding network work and rejects later reads', async () => {
  let started
  const entered = new Promise(resolve => { started = resolve })
  const monitor = createMonitor(resolveConfig({}), auth, async (_url, { signal }) => {
    started()
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  })
  const reading = monitor.read()
  const rejected = assert.rejects(reading, { name: 'AbortError' })
  await entered
  await monitor.dispose()
  await rejected
  await assert.rejects(monitor.read(), { name: 'AbortError' })
})
