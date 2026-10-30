/** Read-only local Codex login fallback never copies or refreshes CLI credentials. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAuthResolver } from '../auth.js'
import { resolveConfig } from '../usage.js'

const jwt = expires => `header.${Buffer.from(JSON.stringify({ exp: expires })).toString('base64url')}.signature`
const login = () => ({ auth_mode: 'chatgpt', tokens: { access_token: jwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: 'do-not-use', account_id: 'local-account' } })
async function fixture(t, value = login()) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-quota-auth-')))
  const path = join(dir, 'auth.json')
  if (value !== undefined) await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 })
  t.after(async () => {
    const confirmed = await realpath(dir)
    assert.equal(confirmed, dir)
    assert.ok(confirmed.startsWith(await realpath(tmpdir())))
    await rm(confirmed, { recursive: true, force: true })
  })
  return path
}
const credentials = { async readRecord(key) { return key === 'llm-pi-ai/openai' ? { kind: 'grant', payload: { type: 'oauth', access: 'direct-token-not-for-codex' } } : undefined } }
const models = { async getAuth() { throw new Error('CLI access reuse must not refresh or import into Harness') } }

test('direct Harness login can coexist with a reusable local Codex login', async t => {
  const path = await fixture(t)
  const original = await readFile(path, 'utf8')
  const result = await createAuthResolver(credentials, models, { codexAuthPath: path })()
  assert.equal(result.unsupported, undefined)
  assert.equal(result.accountId, 'local-account')
  assert.equal(result.provider, 'openai-codex')
  assert.equal(result.accessToken, login().tokens.access_token)
  assert.equal(await readFile(path, 'utf8'), original)
})

test('file replacement is observed without using or rewriting refresh tokens', async t => {
  const path = await fixture(t)
  const resolve = createAuthResolver(credentials, models, { codexAuthPath: path })
  assert.equal((await resolve()).accountId, 'local-account')
  const next = login(); next.tokens.account_id = 'next-account'
  await writeFile(path, JSON.stringify(next))
  assert.equal((await resolve()).accountId, 'next-account')
})

test('expired local access reports its source without attempting refresh', async t => {
  const value = login(); value.tokens.access_token = jwt(1)
  const path = await fixture(t, value)
  await assert.rejects(createAuthResolver(credentials, models, { codexAuthPath: path })(), { code: 'codex-cli-expired' })
})

test('malformed local login does not expose file contents', async t => {
  const path = await fixture(t, 'private-malformed-token')
  await assert.rejects(createAuthResolver(credentials, models, { codexAuthPath: path })(), error => error.code === 'codex-cli-unavailable' && !String(error).includes('private'))
})

test('missing CLI login retains the unsupported direct grant result', async t => {
  const path = await fixture(t)
  assert.deepEqual(await createAuthResolver(credentials, models, { codexAuthPath: join(path, '../absent.json') })(), { unsupported: true })
})

test('a configured Harness Codex grant stays primary instead of switching accounts', async t => {
  const path = await fixture(t)
  const grant = { type: 'oauth', access: 'harness-token', expires: Date.now() + 3600000, accountId: 'harness-account' }
  const store = { async readRecord() { return { kind: 'grant', payload: grant } } }
  const result = await createAuthResolver(store, { async getAuth() { return { auth: { apiKey: grant.access } } } }, { codexAuthPath: path })()
  assert.equal(result.accountId, 'harness-account')
})

test('local login reads respect an already-cancelled lifetime', async t => {
  const path = await fixture(t)
  await assert.rejects(createAuthResolver(credentials, models, { codexAuthPath: path })(AbortSignal.abort()), { name: 'AbortError' })
})

test('CLI auth path defaults to Codex home and can be explicitly disabled', () => {
  assert.ok(resolveConfig({}).codexAuthPath.endsWith('/auth.json'))
  assert.equal(resolveConfig({ codexAuthPath: null }).codexAuthPath, null)
  assert.throws(() => resolveConfig({ codexAuthPath: '../relative-auth.json' }), /codexAuthPath/)
})
