/** Compatibility adapter for the llm-pi-ai-owned Codex credential format. */
import { UsageError } from './usage.js'
import { resolveCliAuth } from './cli-auth.js'

const CODEX_KEY = 'llm-pi-ai/openai-codex'
const DIRECT_KEY = 'llm-pi-ai/openai'

function tokenText(value) {
  return typeof value === 'string' && value.length > 0 && !/[\s\x00-\x1f\x7f]/.test(value)
}

/** Read a compatible stored grant without importing direct ChatGPT or ambient API credentials. */
export async function resolveStoredAuth(credentials) {
  const record = await credentials.readRecord(CODEX_KEY)
  if (record?.kind !== 'grant') {
    return (await credentials.readRecord(DIRECT_KEY))?.kind === 'grant' ? { unsupported: true } : undefined
  }
  const grant = record.payload
  if (grant === null || typeof grant !== 'object' || grant.type !== 'oauth' || !tokenText(grant.access)
    || !tokenText(grant.accountId) || typeof grant.expires !== 'number' || !Number.isFinite(grant.expires)
    || grant.expires <= Date.now()) throw new UsageError('auth-required')
  return { provider: 'openai-codex', accessToken: grant.access, accountId: grant.accountId }
}

/** Restrict pi-ai's credential store to Codex, retaining its serialized refresh-and-persist operation. */
export function codexCredentialStore(credentials) {
  const pending = new Set()
  let closing = false
  const own = async operation => {
    if (closing) throw new DOMException('Credential adapter disposed', 'AbortError')
    const task = Promise.resolve().then(operation)
    pending.add(task)
    try { return await task }
    finally { pending.delete(task) }
  }
  return {
    async read(providerId) {
      return own(async () => {
        if (providerId !== 'openai-codex') return undefined
        const record = await credentials.readRecord(CODEX_KEY)
        return record?.kind === 'grant' ? record.payload : undefined
      })
    },
    async list() {
      return own(async () => (await credentials.readRecord(CODEX_KEY))?.kind === 'grant' ? [{ providerId: 'openai-codex', type: 'oauth' }] : [])
    },
    async modify(providerId, mutate) {
      return own(async () => {
        if (providerId !== 'openai-codex') throw new UsageError('auth-required')
        const record = await credentials.modifyRecord(CODEX_KEY, async current => {
          const next = await mutate(current?.kind === 'grant' ? current.payload : undefined)
          return next === undefined ? undefined : { kind: 'grant', payload: JSON.parse(JSON.stringify(next)) }
        })
        return record?.kind === 'grant' ? record.payload : undefined
      })
    },
    async delete() {
      // Quota reads must never sign the user out, including on a temporary OAuth failure.
      throw new UsageError('auth-required')
    },
    async dispose() {
      closing = true
      // pi-ai cancels getAuth's wait, not an already-started token rotation and durable commit.
      await Promise.allSettled([...pending])
    },
  }
}

/** Refresh through pi-ai's owner protocol, then require the stored account to match the returned token. */
export function createAuthResolver(credentials, models, config = {}) {
  return async signal => {
    signal?.throwIfAborted()
    const stored = await credentials.readRecord(CODEX_KEY)
    signal?.throwIfAborted()
    if (stored?.kind !== 'grant') {
      const local = await resolveCliAuth(config.codexAuthPath, signal)
      return local ?? resolveStoredAuth(credentials)
    }
    let resolved
    try {
      resolved = await models.getAuth('openai-codex', { signal })
    } catch (error) {
      // pi-ai refresh errors can include token endpoint content; never serialize or log them.
      signal?.throwIfAborted()
      throw new UsageError('auth-required')
    }
    signal?.throwIfAborted()
    const auth = await resolveStoredAuth(credentials)
    if (auth?.unsupported || auth === undefined || auth.accessToken !== resolved?.auth?.apiKey) throw new UsageError('auth-required')
    return auth
  }
}
