import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveConfig, resolveRequest, searchPlugins } from '../search.js'
import { apply } from '../index.js'

const config = resolveConfig({ registry: 'https://registry.npmjs.org/', timeoutMs: 1000, pageSize: 10, maxResponseBytes: 10000, maxOutputBytes: 32768 })
const signal = () => new AbortController().signal
const json = value => new Response(JSON.stringify(value))
const manifest = (name, extra = {}) => ({ name, version: '1.2.3', description: 'A public bundle', dsh: { bundle: { patch: './cordis.patch.yml' } }, ...extra })
function registry(names, manifests = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error')
    const path = new URL(url).pathname
    if (path.endsWith('/-/v1/search')) return json({ total: 50, objects: names.map(name => ({ package: { name } })) })
    const name = decodeURIComponent(path.slice(1, -'/latest'.length))
    return manifests[name] instanceof Response ? manifests[name] : json(manifests[name] ?? manifest(name))
  }
}

test('rejects invalid deployment configuration and tool JSON', () => {
  for (const bad of [{ ...config, registry: 'http://registry.npmjs.org' }, { ...config, timeoutMs: 0 }, { ...config, pageSize: 21 }, { ...config, unknown: true }]) {
    assert.throws(() => resolveConfig(bad), { code: 'INVALID_CONFIG' })
  }
  for (const bad of [null, {}, { query: 2 }, { query: 'x'.repeat(201) }, { query: '', offset: -1 }, { query: '', offset: 1.2 }, { query: '', install: true }]) {
    assert.throws(() => resolveRequest(bad), { code: 'INVALID_QUERY' })
  }
  assert.deepEqual(resolveRequest({ query: ' browser ' }), { query: 'browser', offset: 0 })
})

test('verifies latest bundle metadata, excludes unrelated, deprecated and private packages', async () => {
  const names = ['@community/dsh-browser', 'dsh-shell', 'dsh-private', 'dsh-old', 'dsh-array']
  const result = await searchPlugins({ query: 'browser' }, config, signal(), registry(names, {
    'dsh-shell': manifest('dsh-shell', { dsh: null }),
    'dsh-private': manifest('dsh-private', { private: true }),
    'dsh-old': manifest('dsh-old', { deprecated: 'Use another package' }),
    'dsh-array': manifest('dsh-array', { dsh: { bundle: { patch: ['a.yml', 'b.yml'] } } }),
    '@community/dsh-browser': manifest('@community/dsh-browser', { engines: { dsh: '>=0.1.0' }, homepage: 'javascript:alert(1)' }),
  }))
  assert.deepEqual(result.plugins.map(item => item.name), ['@community/dsh-browser', 'dsh-array'])
  assert.equal(result.plugins[0].dshRequirement, '>=0.1.0')
  assert.equal(result.plugins[0].homepage, '')
  assert.equal(result.plugins[0].installSpec, '@community/dsh-browser@1.2.3')
  assert.equal(result.nextOffset, 5)
  assert.deepEqual(result.failures, [])
})

test('sends encoded query and candidate pagination to the selected registry', async () => {
  let observed
  const result = await searchPlugins({ query: 'browser & tools', offset: 20 }, config, signal(), async url => {
    observed = new URL(url)
    return json({ total: 20, objects: [] })
  })
  assert.equal(observed.searchParams.get('text'), 'dsh browser & tools')
  assert.equal(observed.searchParams.get('from'), '20')
  assert.equal(observed.searchParams.get('size'), '10')
  assert.equal(result.nextOffset, null)
})

test('returns failed metadata reads separately from successful and excluded packages', async () => {
  const result = await searchPlugins({ query: '' }, config, signal(), registry(['dsh-ok', 'dsh-failed', 'dsh-wrong'], {
    'dsh-failed': new Response('Rate limited', { status: 429 }),
    'dsh-wrong': manifest('wrong-name'),
  }))
  assert.equal(result.plugins.length, 1)
  assert.deepEqual(result.failures.map(item => item.code), ['REGISTRY_HTTP', 'INVALID_RESPONSE'])
})

test('rejects malformed, oversized and failed search responses rather than reporting no matches', async () => {
  const cases = [
    [async () => new Response('not json'), 'INVALID_RESPONSE'],
    [async () => json({ objects: [] }), 'INVALID_RESPONSE'],
    [async () => json({ total: 1, objects: [{ package: { name: '../escape' } }] }), 'INVALID_RESPONSE'],
    [async () => new Response('x'.repeat(10001)), 'RESPONSE_TOO_LARGE'],
    [async () => new Response('failure', { status: 503 }), 'REGISTRY_HTTP'],
    [async () => { throw new TypeError('fetch failed') }, 'NETWORK_ERROR'],
  ]
  for (const [fetcher, code] of cases) {
    await assert.rejects(searchPlugins({ query: '' }, config, signal(), fetcher), { code })
  }
})

test('bounds complete multibyte JSON output and marks omitted entries', async () => {
  const names = Array.from({ length: 10 }, (_, i) => `dsh-${i}`)
  const entries = Object.fromEntries(names.map(name => [name, manifest(name, { description: '中'.repeat(500) })]))
  const result = await searchPlugins({ query: '' }, { ...config, maxOutputBytes: 2048 }, signal(), registry(names, entries))
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 2048)
  assert.equal(result.outputTruncated, true)
  assert.equal(result.checkedCandidates, 10)
})

test('distinguishes cancellation from a whole-search deadline', async () => {
  const blocked = (_url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(searchPlugins({ query: '' }, config, aborted.signal, blocked), { code: 'CANCELLED' })
  // Keep the test runner alive while AbortSignal.timeout's unref'ed timer settles.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await assert.rejects(searchPlugins({ query: '' }, { ...config, timeoutMs: 1 }, signal(), blocked), { code: 'TIMEOUT' })
  } finally { clearInterval(keepAlive) }
})

test('unregisters its tool and propagates cancellation', async () => {
  let definition
  let dispose
  let registered = false
  apply({ effect: callback => { dispose = callback() }, tools: { register: value => { definition = value; registered = true; return () => { registered = false } } } }, config)
  assert.equal(registered, true)
  assert.equal(definition.name, 'search_public_dsh_plugins')
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(definition.execute({ query: '' }, { signal: aborted.signal }), { code: 'CANCELLED' })
  await dispose()
  assert.equal(registered, false)
})

test('pins the public tool schema and transcript rendering', async () => {
  let definition
  let dispose
  apply({ effect: callback => { dispose = callback() }, tools: { register: value => { definition = value; return () => {} } } }, config)
  const actual = JSON.stringify({ name: definition.name, description: definition.description, parameters: definition.parameters, content: definition.output.render({}, { plugins: [], nextOffset: null }) }, null, 2) + '\n'
  const expected = await readFile(new URL('./tool.expected.json', import.meta.url), 'utf8')
  assert.equal(actual, expected)
  await dispose()
})
