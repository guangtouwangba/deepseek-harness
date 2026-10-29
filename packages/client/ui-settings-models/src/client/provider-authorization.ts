/** Models-page controller for subscription authorization and provider activation. */
import type { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelsSettingsStore, ProviderDirectoryEntry } from './store.ts'
import type { ProviderSignInState, ProviderSignInInjected } from './ProviderSignIn.tsx'
import { ProviderSignIn } from './ProviderSignIn.tsx'
import { authorizationEn, authorizationZh } from './authorization-copy.ts'
import { SubscriptionOnboarding } from './SubscriptionOnboarding.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Provider OAuth interaction copy. */
    'settings.providerAuthorization': keyof typeof authorizationEn
  }
}

/** Owns a single interactive login; snapshots contain no credential values. */
export class ProviderSignInController {
  /** Display-safe state shared by onboarding and provider cards. */
  readonly store = createSnapshotStore<ProviderSignInState>({ entries: [], models: [], busy: false, loaded: false })
  private abort: AbortController | undefined
  private disposed = false
  private revision = 0

  private isDisposed(): boolean { return this.disposed }

  /** @param remote - generated provider-login, model-catalog and settings operations. */
  constructor(private readonly remote: Pick<ClientRemote, 'providerAuthorization' | 'session' | 'settings'>) {}

  private publish(patch: Partial<ProviderSignInState>): void {
    if (!this.disposed) this.store.update((state) => { Object.assign(state, patch) })
  }

  /** Refresh display-safe login state and the live model catalog. */
  async refresh(): Promise<void> {
    const revision = ++this.revision
    try {
      const [entries, catalog] = await Promise.all([this.remote.providerAuthorization.list(), this.remote.session.modelCatalog()])
      if (revision !== this.revision || this.disposed) return
      if (!entries.ok || !catalog.ok) throw new Error('Provider state unavailable')
      this.publish({ entries: entries.value, loaded: true,
        models: catalog.value.groups.flatMap(group => group.models.map(model => ({ id: model.id, name: model.name, provider: group.id }))),
        defaultModel: catalog.value.default,
      })
    } catch (_error) {
      if (revision === this.revision) this.publish({ failed: true })
    }
  }

  /**
   * Start an OAuth conversation; activate an unconfigured route after successful login.
   * @param provider - directory entry whose profile is activated.
   * @param method - registered authorization method.
   */
  async start(provider: ProviderDirectoryEntry, method: string): Promise<void> {
    if (this.disposed || this.store.getSnapshot().busy) return
    const abort = new AbortController()
    this.abort = abort
    const key = `${provider.settingsNs}/${provider.provider}`
    this.publish({ activeKey: key, busy: true, failed: false, frame: { status: 'running' } })
    try {
      const stream = this.remote.providerAuthorization.login(key, method, abort.signal)
      let authorized = false
      for await (const frame of stream) {
        if (this.isDisposed()) break
        this.publish({ frame, failed: frame.status === 'failed' })
        authorized = frame.status === 'authorized'
      }
      if (authorized && !this.isDisposed()) await this.activate(provider)
    } catch (_error) {
      if (!abort.signal.aborted) this.publish({ failed: true })
    } finally {
      this.abort = undefined
      this.publish({ busy: false })
      if (!this.isDisposed()) await this.refresh()
    }
  }

  private async activate(provider: ProviderDirectoryEntry): Promise<void> {
    const described = await this.remote.settings.describe()
    if (!described.ok) throw new Error('Provider configuration unavailable')
    const namespace = described.value.namespaces.find(entry => entry.ns === provider.settingsNs)
    if (namespace === undefined) throw new Error('Provider configuration unavailable')
    let profile: unknown = namespace.value
    for (const part of provider.settingsPath) profile = typeof profile === 'object' && profile !== null ? Reflect.get(profile, part) : undefined
    if (profile !== undefined) return
    const saved = await this.remote.settings.mutate(provider.settingsNs,
      [{ op: 'set', path: [...provider.settingsPath], value: {} }], namespace.revision)
    if (!saved.ok) throw new Error('Provider activation failed')
  }

  /** Cancel the active login without changing an existing credential. */
  cancel(): void { this.abort?.abort() }

  /**
   * Retry state loading and activation after a configuration failure without repeating OAuth.
   * @param provider - provider whose configuration is being repaired.
   */
  async retry(provider: ProviderDirectoryEntry): Promise<void> {
    if (this.store.getSnapshot().busy || this.isDisposed()) return
    this.publish({ busy: true, failed: false })
    try {
      await this.refresh()
      if (this.store.getSnapshot().entries.some(entry => entry.key === `${provider.settingsNs}/${provider.provider}` && entry.signedIn)) {
        await this.activate(provider)
        await this.refresh()
      }
    } catch (_error) { this.publish({ failed: true }) }
    finally { this.publish({ busy: false }) }
  }

  /**
   * Submit one answer without retaining user input in shared state.
   * @param id - active question identity.
   * @param value - user input.
   */
  async answer(id: string, value: string): Promise<void> {
    try {
      const result = await this.remote.providerAuthorization.answer(id, value)
      if (!result.ok) this.publish({ failed: true })
    } catch (_error) { this.publish({ failed: true }) }
  }

  /**
   * Forget a provider's stored credential and refresh its displayed state.
   * @param key - registered provider credential to forget.
   */
  async signOut(key: string): Promise<void> {
    if (this.store.getSnapshot().busy) return
    this.publish({ activeKey: key, busy: true, failed: false })
    try {
      const result = await this.remote.providerAuthorization.signOut(key)
      if (!result.ok) throw new Error('Sign-out failed')
      await this.refresh()
    } catch (_error) { this.publish({ failed: true }) }
    finally { this.publish({ busy: false }) }
  }

  /**
   * Save an explicitly selected catalog model as the default for new sessions.
   * @param provider - catalog provider.
   * @param model - explicitly selected catalog model.
   */
  async selectModel(provider: string, model: string): Promise<void> {
    if (this.store.getSnapshot().busy
      || !this.store.getSnapshot().models.some(entry => entry.provider === provider && entry.id === model)) return
    this.publish({ busy: true, failed: false, activeKey: `llm-pi-ai/${provider}` })
    try {
      const result = await this.remote.settings.replace('agent-default-model', { provider, model }, undefined)
      if (!result.ok) throw new Error('Default model could not be saved')
      await this.refresh()
    } catch (_error) { this.publish({ failed: true }) }
    finally { this.publish({ busy: false }) }
  }

  /** Stop login and ignore replies after plugin disposal. */
  dispose(): void { this.disposed = true; this.revision++; this.cancel() }
}

/**
 * Register pi-ai login cards through the Models page's extension slot.
 * @param ctx - Client context with the generated provider authorization namespace.
 * @param models - Models-page configuration snapshot and refresh owner.
 * @param automatic - whether this browser owns first-run credential setup.
 * @returns registrations and cleanup owned by the caller's access grant.
 */
export function* registerProviderAuthorization(ctx: Context, models: ModelsSettingsStore, automatic: boolean): Generator<() => void, void> {
  yield ctx.locale.register('settings.providerAuthorization', { en: authorizationEn, zh: authorizationZh })
  const controller = new ProviderSignInController(ctx.remote)
  yield () => { controller.dispose() }
  const injected = (): ProviderSignInInjected => ({
    hooks: { authorization: controller.store },
    start: (provider, method) => { void controller.start(provider, method) },
    cancel: () => { controller.cancel() },
    answer: (id, value) => { void controller.answer(id, value) },
    signOut: (key) => { void controller.signOut(key) },
    selectModel: (provider, model) => { void controller.selectModel(provider, model) },
    retry: (provider) => { void controller.retry(provider) },
    t: ctx.locale.bind('settings.providerAuthorization'),
  })
  yield ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card', key: 'llm-pi-ai', inject: injected,
  }, ProviderSignIn))
  yield ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding', id: 'chatgpt-subscription', order: -1,
    inject: () => ({ ...injected(), automatic, loadModels: () => { void models.load() },
      hooks: { authorization: controller.store, models: models.store } }),
  }, SubscriptionOnboarding))
  void controller.refresh()
  const refresh = () => { void controller.refresh() }
  yield ctx.remote.$on('credentials/record-updated', refresh)
  yield ctx.remote.$on('authorization/settled', refresh)
  yield ctx.remote.$on('settings/document-updated', refresh)
  yield ctx.on('connection/reset', () => { controller.cancel(); refresh() })
}
