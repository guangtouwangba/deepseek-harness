import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Authorization from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { ProviderAuthorizationController } from '../src/authorization.ts'

const key = credentialKey('llm-pi-ai', 'openai-codex')
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function boot() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(Authorization)
  await ctx.plugin(ProviderAuthorizationController)
  return ctx
}

describe('provider subscription authorization', () => {
  it('relays a browser login and manual code, storing credentials only on the host', async () => {
    const ctx = await boot()
    ctx.authorization.registerFlow({ key, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
      async run(session) {
        session.notify({ message: 'Open browser', url: 'https://auth.openai.com/authorize' })
        expect(await session.prompt({ kind: 'text', message: 'Paste callback' })).toBe('callback')
        await session.commit({ kind: 'grant', payload: { access: 'secret-access', refresh: 'secret-refresh' } })
      },
    })
    const controller = ctx.providerAuthorizationController
    expect(await controller.list()).toMatchObject([{ key, signedIn: false }])
    const stream = controller.login(key, 'oauth', new AbortController().signal)
    const frames = []
    for await (const frame of stream) {
      frames.push(frame)
      if (frame.prompt) controller.answer(frame.prompt.id, 'callback')
    }
    expect(frames.at(-1)?.status).toBe('authorized')
    expect(JSON.stringify(frames)).not.toContain('secret-access')
    expect(await controller.list()).toMatchObject([{ key, signedIn: true }])
    await controller.signOut(key)
    expect(await controller.list()).toMatchObject([{ key, signedIn: false }])
  })

  it('cancels a waiting prompt and rejects stale replies', async () => {
    const ctx = await boot()
    ctx.authorization.registerFlow({ key, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Login' }],
      async run(session) { await session.prompt({ kind: 'secret', message: 'Code' }) },
    })
    const abort = new AbortController()
    const controller = ctx.providerAuthorizationController
    let promptId = ''
    for await (const frame of controller.login(key, 'oauth', abort.signal)) {
      if (frame.prompt) { promptId = frame.prompt.id; abort.abort() }
    }
    expect(ctx.authorization.describe(key)?.inFlight).toBe(false)
    expect(() => { controller.answer(promptId, 'late') }).toThrow()
    expect(await ctx.credentials.readRecord(key)).toBeUndefined()
  })

  it('does not disclose provider errors that may contain credentials', async () => {
    const ctx = await boot()
    ctx.authorization.registerFlow({ key, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Login' }],
      async run() { throw new Error('secret-access') },
    })
    const frames = []
    for await (const frame of ctx.providerAuthorizationController.login(key, 'oauth', new AbortController().signal)) frames.push(frame)
    expect(frames.at(-1)?.status).toBe('failed')
    expect(JSON.stringify(frames)).not.toContain('secret-access')
  })
})
