/** The installed contribution registers one authenticated route and unwinds it. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHost } from '../host.js'

test('exact owner-only Connection route returns no-store JSON and unload waits', async () => {
  const cleanups = []
  let route
  let removed = false
  let disposed = false
  const events = new Map()
  const ctx = {
    connection: { fetch: { register(value) { route = value; return async () => { removed = true } } } },
    effect(factory) { cleanups.push(factory()) },
    on(name, callback) { events.set(name, callback); cleanups.push(() => events.delete(name)) },
  }
  let invalidations = 0
  const monitor = { async read() { return { status: 'signed-out', code: 'auth-required', refreshIntervalMs: 60000 } }, invalidate() { invalidations++ }, async dispose() { disposed = true } }
  registerHost(ctx, monitor)
  assert.equal(route.path, '/api/local-openai-usage')
  assert.deepEqual(route.methods, ['GET'])
  const response = await route.fetch(new Request('http://localhost/api/local-openai-usage'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.json()).status, 'signed-out')
  events.get('credentials/record-updated')('unrelated/key')
  assert.equal(invalidations, 0)
  events.get('credentials/record-updated')('llm-pi-ai/openai-codex')
  assert.equal(invalidations, 1)
  for (const cleanup of cleanups.reverse()) await cleanup()
  assert.equal(removed, true)
  assert.equal(disposed, true)
  assert.equal(events.size, 0)
})
