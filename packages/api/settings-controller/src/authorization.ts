/** Browser interactions for registered provider login flows; credentials remain on the Host. */
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import type { AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ProviderAuthorizationFrame, ProviderAuthorizationEntry } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of provider login conversations. */
    providerAuthorizationController: ProviderAuthorizationController
  }
}

/** A remote login owns its prompts until answered, withdrawn, or disconnected. */
export class ProviderAuthorizationController extends TypertRemoteService {
  static inject = ['authorization', 'credentials']
  private readonly answers = new Map<string, (value: string) => void>()

  /** @param ctx - Host with authorization and credential storage. */
  constructor(ctx: Context) {
    super(ctx, 'providerAuthorizationController', { namespace: 'providerAuthorization' })
  }

  /**
   * Describe provider sign-in availability without disclosing credentials.
   * @returns registered login methods and credential presence, never credential contents.
   */
  @Remote
  async list(): Promise<ProviderAuthorizationEntry[]> {
    const records = await this.ctx.credentials.listRecords()
    const signedIn = new Set(records.map(record => record.key))
    return this.ctx.authorization.list().map(entry => ({
      key: entry.key, label: entry.label, inFlight: entry.inFlight,
      methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
      signedIn: signedIn.has(entry.key),
    }))
  }

  /**
   * Run one login, streaming the current notice and prompt. Disconnect cancels the flow.
   * @param key - registered credential record address.
   * @param method - method offered by the registered flow.
   * @param signal - requesting stream lifetime.
   * @returns display-safe interaction snapshots, followed by one terminal status.
   */
  @Remote({ mode: 'stream' })
  async *login(key: string, method: string, signal: AbortSignal): AsyncIterable<ProviderAuthorizationFrame> {
    const record = parseCredentialKey(key)
    const controller = new AbortController()
    const abort = () => { controller.abort() }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    let done: Promise<void> = Promise.resolve()
    const dispose = this.ctx.effect(() => () => { abort(); return done }, 'provider authorization: stream lifetime')
    let frame: ProviderAuthorizationFrame = { status: 'running' }
    let revision = 0
    let wake: (() => void) | undefined
    const publish = (next: ProviderAuthorizationFrame) => { frame = next; revision++; wake?.() }
    const prompt = (request: AuthorizationPrompt): Promise<string> => {
      const id = randomUUID()
      const lifetime = request.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, request.signal])
      if (lifetime.aborted) return Promise.reject(new Error('Login question withdrawn'))
      return new Promise<string>((resolve, reject) => {
        const clear = () => {
          this.answers.delete(id)
          lifetime.removeEventListener('abort', withdrawn)
          if (frame.prompt?.id === id) {
            const { prompt: _prompt, ...rest } = frame
            publish(rest)
          }
        }
        const withdrawn = () => { clear(); reject(new Error('Login question withdrawn')) }
        this.answers.set(id, (value) => { clear(); resolve(value) })
        lifetime.addEventListener('abort', withdrawn, { once: true })
        const question = request.kind === 'select'
          ? { id, kind: request.kind, message: request.message,
            options: request.options.map(option => ({ id: option.id, label: option.label })) }
          : { id, kind: request.kind, message: request.message,
            ...request.placeholder === undefined ? {} : { placeholder: request.placeholder } }
        publish({ ...frame, prompt: question })
      })
    }
    done = this.ctx.authorization.begin({
      key: record, method, signal: controller.signal,
      interaction: {
        notify: (notice) => { publish({ ...frame, notice: { message: notice.message,
          ...notice.url === undefined ? {} : { url: notice.url },
          ...notice.code === undefined ? {} : { code: notice.code } } }) },
        prompt,
      },
    }).then((outcome) => { publish({ status: outcome.status }) }, (_error: unknown) => {
      // Provider exceptions can include token responses; only the status crosses the wire.
      publish({ status: 'failed' })
    })
    try {
      let seen = -1
      while (true) {
        if (seen === revision) await new Promise<void>((resolve) => { wake = resolve })
        seen = revision
        const current = frame
        yield current
        if (current.status !== 'running') break
      }
    } finally {
      abort()
      await done
      signal.removeEventListener('abort', abort)
      await dispose()
    }
  }

  /**
   * Answer a pending prompt once; stale replies are refused.
   * @param id - prompt identity from the active login stream.
   * @param value - user input, never echoed or logged.
   */
  @Remote
  answer(id: string, value: string): void {
    const answer = this.answers.get(id)
    if (answer === undefined) throw new RemoteError('gateway/bad-request', 'The login question has expired. Start sign-in again.', {})
    answer(value)
  }

  /**
   * Forget a registered provider's credential after its login has settled.
   * @param key - registered credential record address.
   */
  @Remote
  async signOut(key: string): Promise<void> {
    const record = parseCredentialKey(key)
    const entry = this.ctx.authorization.describe(record)
    if (entry === undefined || entry.inFlight) throw new RemoteError('gateway/bad-request', 'Cancel sign-in before signing out.', {})
    await this.ctx.credentials.deleteRecord(record)
  }
}
