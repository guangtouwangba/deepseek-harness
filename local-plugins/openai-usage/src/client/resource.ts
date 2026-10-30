/** Abortable polling for the sanitized, same-origin local quota endpoint. */
import { z } from 'zod'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { QuotaErrorCode, QuotaReady } from './types.ts'

const DEFAULT_REFRESH_MS = 60000
const MAX_TIMER_MS = 2147483647
const interval = z.number().int().min(1000).max(MAX_TIMER_MS)
const timestamp = z.iso.datetime({ offset: true })
const window = z.object({
  usedPercent: z.number().min(0).max(100),
  remainingPercent: z.number().min(0).max(100),
  windowSeconds: z.number().positive(),
  resetsAt: timestamp.nullable(),
})
const reason = z.enum(['auth-required', 'subscription-required', 'request-failed', 'invalid-response', 'rate-limited', 'timeout', 'codex-cli-expired', 'codex-cli-unavailable'])
const response = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), provider: z.enum(['openai', 'openai-codex']), credentialSource: z.enum(['harness', 'codex-cli']).optional(), planType: z.string().nullable(),
    weekly: window.nullable(), shortTerm: window.nullable(), fetchedAt: timestamp, refreshIntervalMs: interval }),
  z.object({ status: z.enum(['signed-out', 'unsupported', 'error']), code: reason, refreshIntervalMs: interval }),
])

function failure(code: QuotaErrorCode): RemoteResult<QuotaReady> {
  return { ok: false, error: new RemoteError('local-openai-usage/error', code, { reason: code }) }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Emit one resource frame per completed read; failed frames preserve the registry's last good value.
 * @param signal - Resource lifetime; abort stops the active fetch or polling delay.
 * @returns Serialized reads using the last validated Host interval, initially 60 seconds.
 */
export async function* pollQuota(signal: AbortSignal): AsyncGenerator<RemoteResult<QuotaReady>> {
  let delay = DEFAULT_REFRESH_MS
  while (!signal.aborted) {
    let frame: RemoteResult<QuotaReady>
    try {
      const result = await fetch('api/local-openai-usage', { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal })
      if (signal.aborted) return
      if (!result.ok) {
        frame = failure(result.status === 401 || result.status === 403 ? 'auth-required' : result.status === 429 ? 'rate-limited' : 'request-failed')
      } else {
        let json: unknown
        try { json = await result.json() }
        catch (_error) { json = undefined /* Invalid HTTP JSON is reported as a failed resource frame. */ }
        if (signal.aborted) return
        const parsed = response.safeParse(json)
        if (!parsed.success) frame = failure('invalid-response')
        else {
          delay = parsed.data.refreshIntervalMs
          frame = parsed.data.status === 'ready' ? { ok: true, value: parsed.data } : failure(parsed.data.code)
        }
      }
    } catch (error) {
      if (signal.aborted) return
      frame = failure(error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'request-failed')
    }
    yield frame
    await wait(delay, signal)
  }
}
