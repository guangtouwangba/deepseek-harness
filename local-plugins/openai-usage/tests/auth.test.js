/** Only compatible grants may reach the Codex quota endpoint. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { codexCredentialStore, createAuthResolver, resolveStoredAuth } from '../auth.js'
import { createModels } from '@earendil-works/pi-ai/models'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createMonitor } from '../monitor.js'
import { resolveConfig } from '../usage.js'

function store(records) {
  return { async readRecord(key) { return records[key] } }
}
const grant = payload => ({ kind: 'grant', payload })
const codex = () => ({ type: 'oauth', access: 'private-access', refresh: 'private-refresh', expires: Date.now() + 3600000, accountId: 'private-account' })

test('compatible Codex grant is read without mutating either login', async () => {
  const records = { 'llm-pi-ai/openai-codex': grant(codex()) }
  const value = await resolveStoredAuth(store(records))
  assert.equal(value.provider, 'openai-codex')
  assert.equal(value.accessToken, 'private-access')
  assert.equal(value.accountId, 'private-account')
})

test('direct ChatGPT grant is unsupported and is never passed to the Codex API', async () => {
  assert.deepEqual(await resolveStoredAuth(store({ 'llm-pi-ai/openai': grant({ type: 'oauth', access: 'direct-secret' }) })), { unsupported: true })
})

test('absent login or API key is not a subscription', async () => {
  assert.equal(await resolveStoredAuth(store({})), undefined)
  assert.equal(await resolveStoredAuth(store({ 'llm-pi-ai/openai-codex': { kind: 'api-key', key: 'sk-test' } })), undefined)
})

test('refresh uses serialized storage, preserves grant fields and never imports the direct grant', async () => {
  let record = grant(codex())
  const credentials = {
    async readRecord(key) { assert.equal(key, 'llm-pi-ai/openai-codex'); return record },
    async modifyRecord(key, mutate) { assert.equal(key, 'llm-pi-ai/openai-codex'); record = await mutate(record) ?? record; return record },
  }
  const adapter = codexCredentialStore(credentials)
  assert.equal(await adapter.read('openai'), undefined)
  const resolver = createAuthResolver(credentials, { async getAuth(id, { signal }) {
    assert.equal(id, 'openai-codex')
    assert.equal(signal, undefined)
    const refreshed = await adapter.modify(id, async value => ({ ...value, access: 'refreshed', optional: undefined }))
    return { auth: { apiKey: refreshed.access } }
  } })
  assert.equal((await resolver()).accessToken, 'refreshed')
  assert.equal(Object.hasOwn(record.payload, 'optional'), false)
  assert.equal((await adapter.list()).length, 1)
  await assert.rejects(adapter.delete('openai-codex'), { code: 'auth-required' })
  await assert.rejects(adapter.modify('openai', () => undefined), { code: 'auth-required' })
})

test('store disposal waits for token rotation persistence and refuses later operations', async () => {
  let release
  let entered
  const enteredPromise = new Promise(resolve => { entered = resolve })
  const held = new Promise(resolve => { release = resolve })
  let committed = false
  const adapter = codexCredentialStore({ async modifyRecord(_key, mutate) {
    entered()
    await held
    const result = await mutate(grant(codex()))
    committed = true
    return result
  } })
  const rotating = adapter.modify('openai-codex', async value => value)
  await enteredPromise
  let disposed = false
  const disposal = adapter.dispose().then(() => { disposed = true })
  await Promise.resolve()
  assert.equal(disposed, false)
  release()
  await rotating
  await disposal
  assert.equal(committed, true)
  await assert.rejects(adapter.read('openai-codex'), { name: 'AbortError' })
})

test('real pi-ai cancellation cannot finish plugin disposal before rotated credentials persist', async () => {
  let record = grant({ ...codex(), expires: 0 })
  let release
  let entered
  const rotating = new Promise(resolve => { release = resolve })
  const started = new Promise(resolve => { entered = resolve })
  let committed = false
  const credentials = {
    async readRecord() { return record },
    async modifyRecord(_key, mutate) { record = await mutate(record) ?? record; committed = true; return record },
  }
  const adapter = codexCredentialStore(credentials)
  const provider = openaiCodexProvider()
  provider.auth.oauth.refresh = async () => { entered(); await rotating; return { ...codex(), access: 'rotated-access' } }
  provider.auth.oauth.toAuth = async value => ({ apiKey: value.access })
  const models = createModels({ credentials: adapter, authContext: { env: async () => undefined, fileExists: async () => false } })
  models.setProvider(provider)
  const monitor = createMonitor(resolveConfig({}), createAuthResolver(credentials, models), () => { throw new Error('must not fetch') })
  const reading = assert.rejects(monitor.read(), { name: 'AbortError' })
  await started
  let disposed = false
  const disposal = (async () => { await monitor.dispose(); await adapter.dispose(); disposed = true })()
  await new Promise(setImmediate)
  assert.equal(disposed, false)
  assert.equal(committed, false)
  release()
  await disposal
  await reading
  assert.equal(committed, true)
  assert.equal(record.payload.access, 'rotated-access')
})

test('refresh failures and account changes refuse auth without raw provider diagnostics', async () => {
  const credentials = store({ 'llm-pi-ai/openai-codex': grant(codex()) })
  for (const models of [{ async getAuth() { throw new Error('private response') } }, { async getAuth() { return { auth: { apiKey: 'different-account' } } } }]) {
    await assert.rejects(createAuthResolver(credentials, models)(), error => error.code === 'auth-required' && !error.message.includes('private'))
  }
})

test('malformed or expired Codex grants fail without exposing values', async () => {
  for (const payload of [{ ...codex(), expires: 0 }, { ...codex(), accountId: undefined }, { ...codex(), access: '\nsecret' }, null]) {
    await assert.rejects(resolveStoredAuth(store({ 'llm-pi-ai/openai-codex': grant(payload) })), { code: 'auth-required' })
  }
})
