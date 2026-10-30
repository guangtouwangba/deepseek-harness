import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig, searchPlugins } from '../search.js'

const config = resolveConfig({ registry: 'https://registry.npmjs.org/', timeoutMs: 120000, pageSize: 10, maxResponseBytes: 1024, maxOutputBytes: 32768 })
const json = value => new Response(JSON.stringify(value))
const page = names => ({ total: names.length, objects: names.map(name => ({ package: { name } })) })
const manifest = (name, extra = {}) => ({ name, version: '1.2.3', dsh: { bundle: { patch: './cordis.patch.yml' } }, ...extra })

function registry(names, entries = {}) {
  return async url => {
    const path = new URL(url).pathname
    if (path === '/-/v1/search') return json(page(names))
    const name = names.find(candidate => path === `/${encodeURIComponent(candidate)}/latest`)
    assert.notEqual(name, undefined, `Unexpected registry request: ${url}`)
    return json(entries[name] ?? manifest(name))
  }
}

test('rejects invalid candidate package names before requesting metadata', async t => {
  const invalidNames = [
    '.', '..', '.hidden', '_hidden', 'a'.repeat(215),
    '@scope/.hidden', '@scope/_hidden', '@.scope/plugin', '@_scope/plugin',
    `@scope/${'a'.repeat(208)}`,
  ]
  for (const name of invalidNames) {
    await t.test(JSON.stringify(name), async () => {
      const requests = []
      const fetcher = async url => {
        requests.push(new URL(url).pathname)
        return json(page([name]))
      }
      await assert.rejects(searchPlugins({ query: '' }, config, new AbortController().signal, fetcher), { code: 'INVALID_RESPONSE' })
      assert.deepEqual(requests, ['/-/v1/search'])
    })
  }
})

test('accepts scoped and unscoped package names at the npm length limit', async () => {
  const names = ['a'.repeat(214), `@scope/${'a'.repeat(207)}`]
  const result = await searchPlugins({ query: '' }, config, new AbortController().signal, registry(names))
  assert.deepEqual(result.plugins.map(plugin => plugin.name), names)
  assert.deepEqual(result.failures, [])
})

test('excludes empty bundle patch strings and arrays', async t => {
  const invalidPatches = ['', ' ', '\n\t', [], [''], [' \t'], ['./valid.yml', ''], ['', './valid.yml'], ['./valid.yml', ' \n']]
  for (const patch of invalidPatches) {
    await t.test(JSON.stringify(patch), async () => {
      const name = 'dsh-empty-patch'
      const result = await searchPlugins({ query: '' }, config, new AbortController().signal, registry([name], {
        [name]: manifest(name, { dsh: { bundle: { patch } } }),
      }))
      assert.deepEqual(result.plugins, [])
      assert.deepEqual(result.failures, [])
      assert.equal(result.checkedCandidates, 1)
    })
  }
})

test('keeps nonempty patch strings and arrays discoverable', async () => {
  const names = ['dsh-string-patch', 'dsh-array-patch']
  const result = await searchPlugins({ query: '' }, config, new AbortController().signal, registry(names, {
    'dsh-array-patch': manifest('dsh-array-patch', { dsh: { bundle: { patch: ['./one.yml', './two.yml'] } } }),
  }))
  assert.deepEqual(result.plugins.map(plugin => plugin.name), names)
  assert.deepEqual(result.failures, [])
})

test('reports unsafe manifest versions as metadata failures instead of install specs', async t => {
  const invalidVersions = [
    '', ' ', ' 1.2.3', '1.2.3 ', '1.2.3\n', '1.2.3\u0000',
    '../1.2.3', '1.2.3/path', 'https://example.invalid/package',
    '1.2.3?download=1', '1.2.3#fragment', '1.2.3@latest', '1.2.3%2fpath',
    `1.2.3-${'a'.repeat(95)}`,
  ]
  for (const version of invalidVersions) {
    await t.test(JSON.stringify(version), async () => {
      const name = 'dsh-unsafe-version'
      const result = await searchPlugins({ query: '' }, config, new AbortController().signal, registry([name], {
        [name]: manifest(name, { version }),
      }))
      assert.deepEqual(result.plugins, [])
      assert.deepEqual(result.failures.map(({ name, code }) => ({ name, code })), [{ name, code: 'INVALID_RESPONSE' }])
    })
  }
})

test('preserves safe prerelease and build version text in install specs', async t => {
  for (const version of ['1.2.3-rc.1+build.7', `1.2.3-${'a'.repeat(94)}`]) {
    await t.test(version, async () => {
      const name = '@community/dsh-safe-version'
      const result = await searchPlugins({ query: '' }, config, new AbortController().signal, registry([name], {
        [name]: manifest(name, { version }),
      }))
      assert.equal(result.plugins[0].version, version)
      assert.equal(result.plugins[0].installSpec, `${name}@${version}`)
      assert.deepEqual(result.failures, [])
    })
  }
})

test('cancellation awaits a slow sibling response reader cancellation', async t => {
  const controller = new AbortController()
  const cancelEntered = Promise.withResolvers()
  const releaseCancel = Promise.withResolvers()
  const firstFetchEntered = Promise.withResolvers()
  const firstFetchAborted = Promise.withResolvers()
  let cancelCompleted = false
  const body = new ReadableStream({
    start(stream) { stream.enqueue(new Uint8Array(config.maxResponseBytes + 1)) },
    async cancel() {
      cancelEntered.resolve()
      await releaseCancel.promise
      cancelCompleted = true
    },
  })
  const names = ['dsh-abort-fetch', 'dsh-slow-cancel']
  const fetcher = async (url, { signal }) => {
    const path = new URL(url).pathname
    if (path === '/-/v1/search') return json(page(names))
    if (path === '/dsh-abort-fetch/latest') {
      firstFetchEntered.resolve()
      return new Promise((resolve, reject) => {
        const abort = () => {
          reject(signal.reason)
          firstFetchAborted.resolve()
        }
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    }
    assert.equal(path, '/dsh-slow-cancel/latest')
    return new Response(body)
  }
  let settled = false
  const outcome = searchPlugins({ query: '' }, config, controller.signal, fetcher).then(
    value => { settled = true; return { value } },
    error => { settled = true; return { error } },
  )
  t.after(async () => {
    controller.abort()
    releaseCancel.resolve()
    await outcome
  })

  await Promise.all([firstFetchEntered.promise, cancelEntered.promise])
  assert.equal(body.locked, true)
  controller.abort()
  await firstFetchAborted.promise
  // An event-loop checkpoint drains the abort rejection without advancing a clock.
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancelCompleted, false)
  assert.equal(settled, false, 'search must not settle while a sibling reader.cancel() is pending')

  releaseCancel.resolve()
  const result = await outcome
  assert.equal(result.error?.code, 'CANCELLED')
  assert.equal(cancelCompleted, true)
  assert.equal(body.locked, false)
})
