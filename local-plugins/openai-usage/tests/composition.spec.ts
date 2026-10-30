/** Real Loader composition with built Host services and a mocked external quota API. */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { boot } from '../../../packages/boot/app-boot/lib/index.js'
import type {} from '../../../packages/client/connection/lib/types/index.d.ts'
import { credentialKey } from '../../../packages/credentials/credentials/lib/index.js'

it.each(['harness', 'codex-cli'] as const)('loads through cordis.yml using %s, projects quota, and removes its route on unload', async source => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-openai-quota-')))
  const pluginRoot = resolve(import.meta.dirname, '..')
  const checkout = resolve(pluginRoot, '../..')
  const file = join(dir, 'cordis.yml')
  const rows = [
    { id: 'credentials', name: join(checkout, 'packages/credentials/credentials-local/lib/index.js'), config: { path: join(dir, 'credentials.yaml') } },
    { id: 'connection', name: join(checkout, 'packages/client/connection/lib/index.js') },
    { id: 'quota', name: join(pluginRoot, 'index.js'), config: { refreshIntervalMs: 60000, codexAuthPath: source === 'codex-cli' ? join(dir, 'auth.json') : null } },
  ]
  await writeFile(file, JSON.stringify(rows))
  if (source === 'codex-cli') {
    const token = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`
    await writeFile(join(dir, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: token, account_id: 'fixture-account' } }), { mode: 0o600 })
  }
  const fetcher = vi.fn(async (url: string) => {
    expect(url).toBe('https://chatgpt.com/backend-api/wham/usage')
    return Response.json({ plan_type: 'plus', rate_limit: {
      primary_window: { used_percent: 20, limit_window_seconds: 18000, reset_at: 1793358000 },
      secondary_window: { used_percent: 40, limit_window_seconds: 604800, reset_at: 1793876400 },
    }, email: 'never-in-result', access_token: 'never-in-result' })
  })
  vi.stubGlobal('fetch', fetcher)
  let ctx: Awaited<ReturnType<typeof boot>> | undefined
  try {
    ctx = await boot('openai-usage-test', file)
    const connection = ctx.get('connection')
    const credentials = ctx.get('credentials')
    if (connection === undefined || credentials === undefined) throw new Error('Host services did not activate')
    await credentials.modifyRecord(credentialKey('llm-pi-ai', source === 'codex-cli' ? 'openai' : 'openai-codex'), async () => ({ kind: 'grant', payload: {
      type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', accountId: 'fixture-account', expires: Date.now() + 3600000,
    } }))
    const shared = connection.createSharedFetchHandler('/api')
    const request = () => new Request('http://localhost/api/local-openai-usage')
    const response = await shared.fetch(request(), connection.browserPeer)
    const value = await response.json()
    expect(response.status).toBe(200)
    expect(value.status).toBe('ready')
    expect(value.credentialSource).toBe(source)
    expect(value.weekly.remainingPercent).toBe(60)
    expect(value.shortTerm.remainingPercent).toBe(80)
    expect(JSON.stringify(value)).not.toContain('fixture-')
    expect(JSON.stringify(value)).not.toContain('never-in-result')
    expect(fetcher).toHaveBeenCalledOnce()
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'quota')
    if (entry === undefined) throw new Error('Loader quota entry absent')
    await entry.update({ disabled: true })
    await ctx.loader.await()
    expect((await shared.fetch(request(), connection.browserPeer)).status).toBe(404)
  } finally {
    await ctx?.fiber.dispose()
    vi.unstubAllGlobals()
    const confirmed = await realpath(dir)
    if (confirmed !== dir || !confirmed.startsWith(await realpath(tmpdir()))) throw new Error('Unexpected temporary directory')
    await rm(confirmed, { recursive: true, force: true })
  }
}, 20000)
