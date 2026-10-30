/** Wire parsing and network safety for subscription quota reads. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseUsage, readUsage, resolveConfig } from '../usage.js'

const config = () => resolveConfig({ provider: 'auto', timeoutMs: 1000, refreshIntervalMs: 60000, maxResponseBytes: 16384 })
const fixture = () => ({ plan_type: 'plus', rate_limit: {
  primary_window: { used_percent: 24, limit_window_seconds: 18000, reset_at: 1793358000 },
  secondary_window: { used_percent: 37, limit_window_seconds: 604800, reset_at: 1793876400 },
} })
const auth = async () => ({ provider: 'openai-codex', accessToken: 'test-secret', accountId: 'test-account' })

test('weekly classification follows duration even when primary and secondary swap', () => {
  const wire = fixture()
  ;[wire.rate_limit.primary_window, wire.rate_limit.secondary_window] = [wire.rate_limit.secondary_window, wire.rate_limit.primary_window]
  const value = parseUsage(wire, 'openai-codex', 1793347200000, 60000)
  assert.equal(value.weekly.remainingPercent, 63)
  assert.equal(value.shortTerm.remainingPercent, 76)
  assert.equal(value.weekly.resetsAt, '2026-11-05T11:00:00.000Z')
})

test('missing weekly window is unknown rather than full or exhausted', () => {
  const wire = fixture()
  wire.rate_limit.secondary_window = null
  assert.equal(parseUsage(wire, 'openai', 0, 60000).weekly, null)
})

test('invalid, unsupported and unbounded upstream fields are rejected', () => {
  for (const used of [-1, 101, '24', NaN]) {
    const wire = fixture()
    wire.rate_limit.primary_window.used_percent = used
    assert.throws(() => parseUsage(wire, 'openai', 0, 60000), { code: 'invalid-response' })
  }
  assert.throws(() => parseUsage({ error: 'private upstream text' }, 'openai', 0, 60000), { code: 'invalid-response' })
  assert.throws(() => parseUsage({ rate_limit: null }, 'openai', 0, 60000), { code: 'subscription-required' })
})

test('fixed trusted endpoint receives auth but only quota fields leave the reader', async () => {
  const value = await readUsage(config(), auth, undefined, async (url, init) => {
    assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage')
    assert.equal(init.headers.Authorization, 'Bearer test-secret')
    assert.equal(init.headers['ChatGPT-Account-Id'], 'test-account')
    assert.equal(init.redirect, 'error')
    return Response.json({ ...fixture(), access_token: 'private', email: 'private@example.test' })
  })
  assert.equal(value.status, 'ready')
  assert.equal(value.weekly.remainingPercent, 63)
  assert.doesNotMatch(JSON.stringify(value), /test-secret|private|test-account/)
})

test('no subscription login makes no network request', async () => {
  const value = await readUsage(config(), async () => undefined, undefined, () => { throw new Error('must not fetch') })
  assert.deepEqual(value, { status: 'signed-out', code: 'auth-required', refreshIntervalMs: 60000 })
})

test('HTTP failures never return upstream response bodies', async () => {
  for (const [status, code] of [[401, 'auth-required'], [403, 'subscription-required'], [429, 'rate-limited'], [500, 'request-failed']]) {
    const value = await readUsage(config(), auth, undefined, async () => new Response('secret upstream text', { status }))
    assert.equal(value.code, code)
    assert.doesNotMatch(JSON.stringify(value), /secret/)
  }
})

test('CLI quota responses identify their source and rejected CLI tokens do not request a Harness login', async () => {
  const cli = async () => ({ ...(await auth()), source: 'codex-cli' })
  const ready = await readUsage(config(), cli, undefined, async () => Response.json(fixture()))
  assert.equal(ready.credentialSource, 'codex-cli')
  const rejected = await readUsage(config(), cli, undefined, async () => new Response('', { status: 401 }))
  assert.equal(rejected.code, 'codex-cli-expired')
})

test('oversized chunked and invalid JSON responses are contained', async () => {
  for (const response of [new Response('x'.repeat(16385)), new Response('{')]) {
    const value = await readUsage(config(), auth, undefined, async () => response)
    assert.equal(value.code, 'invalid-response')
  }
})

test('deadline bounds an abort-aware request and cancellation propagates', async () => {
  const fetcher = async (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const value = await readUsage({ ...config(), timeoutMs: 10 }, auth, undefined, fetcher)
  assert.equal(value.code, 'timeout')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(readUsage(config(), auth, controller.signal, fetcher), { name: 'AbortError' })
})

test('configuration rejects unknown options, invalid bounds and arbitrary endpoints', () => {
  for (const input of [{ endpoint: 'https://attacker.test' }, { timeoutMs: 0 }, { refreshIntervalMs: 5 }, { provider: 'other' }, { maxResponseBytes: Infinity }]) {
    assert.throws(() => resolveConfig(input))
  }
  assert.equal(resolveConfig({}).provider, 'auto')
})
