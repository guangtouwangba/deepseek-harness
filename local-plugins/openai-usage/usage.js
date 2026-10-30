/** Bounded read-only Codex quota protocol; bearer tokens never leave this module's request. */
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Stable failure codes intentionally omit upstream diagnostics and response content. */
export class UsageError extends Error {
  constructor(code) {
    super(`Subscription usage: ${code}`)
    this.name = 'UsageError'
    this.code = code
  }
}

/** Validate deployment-varying request budgets; the credential destination is a fixed protocol URL. */
export function resolveConfig(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('openai-usage config must be an object')
  const config = { provider: 'auto', timeoutMs: 15000, refreshIntervalMs: 60000, maxResponseBytes: 65536,
    codexAuthPath: resolve(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'), ...raw }
  for (const key of Object.keys(raw)) {
    if (!['provider', 'timeoutMs', 'refreshIntervalMs', 'maxResponseBytes', 'codexAuthPath'].includes(key)) throw new Error(`Unknown openai-usage option: ${key}`)
  }
  if (config.codexAuthPath !== null && (typeof config.codexAuthPath !== 'string' || !isAbsolute(config.codexAuthPath))) throw new Error('codexAuthPath must be an absolute path or null')
  if (!['auto', 'openai-codex'].includes(config.provider)) throw new Error('provider must be auto or openai-codex')
  for (const [key, min, max] of [['timeoutMs', 1, 120000], ['refreshIntervalMs', 30000, 3600000], ['maxResponseBytes', 1024, 1048576]]) {
    if (!Number.isSafeInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Invalid openai-usage ${key}`)
  }
  return config
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseWindow(value) {
  if (value === undefined || value === null) return null
  if (!object(value) || typeof value.used_percent !== 'number' || !Number.isFinite(value.used_percent)
    || value.used_percent < 0 || value.used_percent > 100 || !Number.isSafeInteger(value.limit_window_seconds)
    || value.limit_window_seconds <= 0) throw new UsageError('invalid-response')
  let resetsAt = null
  if (value.reset_at !== undefined && value.reset_at !== null) {
    if (!Number.isSafeInteger(value.reset_at) || value.reset_at < 0) throw new UsageError('invalid-response')
    const date = new Date(value.reset_at * 1000)
    if (!Number.isFinite(date.getTime())) throw new UsageError('invalid-response')
    resetsAt = date.toISOString()
  }
  return { usedPercent: value.used_percent, remainingPercent: 100 - value.used_percent, windowSeconds: value.limit_window_seconds, resetsAt }
}

/** Project only quota fields; a week is identified by its protocol duration, not its primary/secondary seat. */
export function parseUsage(wire, provider, now, refreshIntervalMs) {
  if (!object(wire) || !Object.hasOwn(wire, 'rate_limit')) throw new UsageError('invalid-response')
  if (wire.rate_limit === null) throw new UsageError('subscription-required')
  if (!object(wire.rate_limit)) throw new UsageError('invalid-response')
  const windows = [parseWindow(wire.rate_limit.primary_window), parseWindow(wire.rate_limit.secondary_window)].filter(Boolean)
  if (windows.length === 0) throw new UsageError('subscription-required')
  if (wire.plan_type !== undefined && wire.plan_type !== null && (typeof wire.plan_type !== 'string' || wire.plan_type.length > 100)) throw new UsageError('invalid-response')
  return {
    status: 'ready', provider, planType: wire.plan_type ?? null,
    weekly: windows.find(window => window.windowSeconds === 604800) ?? null,
    shortTerm: windows.find(window => window.windowSeconds < 604800) ?? null,
    fetchedAt: new Date(now).toISOString(), refreshIntervalMs,
  }
}

async function boundedJson(response, maxBytes) {
  if (response.body === null) throw new UsageError('invalid-response')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new UsageError('invalid-response')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const data = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch (error) {
    // Wire decoder failures must not include provider response text in the UI or logs.
    throw new UsageError('invalid-response', { cause: error })
  }
}

/** Resolve a Host-only grant and read quota within a deadline, propagating owner cancellation. */
export async function readUsage(config, resolveAuth, signal, fetcher = fetch) {
  signal?.throwIfAborted()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(new DOMException('Usage deadline exceeded', 'TimeoutError')), config.timeoutMs)
  const requestSignal = AbortSignal.any([deadline.signal, ...(signal === undefined ? [] : [signal])])
  try {
    const auth = await resolveAuth(requestSignal)
    requestSignal.throwIfAborted()
    if (auth === undefined) return { status: 'signed-out', code: 'auth-required', refreshIntervalMs: config.refreshIntervalMs }
    if (auth.unsupported) return { status: 'unsupported', code: 'subscription-required', refreshIntervalMs: config.refreshIntervalMs }
    const response = await fetcher('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${auth.accessToken}`, 'ChatGPT-Account-Id': auth.accountId, Accept: 'application/json' },
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new UsageError(response.status === 401 ? (auth.source === 'codex-cli' ? 'codex-cli-expired' : 'auth-required') : response.status === 403 ? 'subscription-required' : response.status === 429 ? 'rate-limited' : 'request-failed')
    }
    return { ...parseUsage(await boundedJson(response, config.maxResponseBytes), auth.provider, Date.now(), config.refreshIntervalMs), credentialSource: auth.source ?? 'harness' }
  } catch (error) {
    signal?.throwIfAborted()
    const code = deadline.signal.aborted ? 'timeout' : error instanceof UsageError ? error.code : 'request-failed'
    return { status: 'error', code, refreshIntervalMs: config.refreshIntervalMs }
  } finally {
    clearTimeout(timer)
  }
}
