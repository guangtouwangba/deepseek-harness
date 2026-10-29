/** Provider login presentation; the injected controller owns remote interaction lifetimes. */
import { useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ProviderAuthorizationEntry, ProviderAuthorizationFrame } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderDirectoryEntry } from './store.ts'
import type { authorizationEn } from './authorization-copy.ts'
import styles from './ProviderSignIn.module.css'
import formStyles from './ModelsSection.module.css'

/** Shared display state for provider sign-in and explicit default-model selection. */
export interface ProviderSignInState {
  entries: ProviderAuthorizationEntry[]
  models: { id: string; name: string; provider: string }[]
  busy: boolean
  loaded: boolean
  activeKey?: string
  frame?: ProviderAuthorizationFrame
  failed?: boolean
  defaultModel?: { provider: string; model: string }
}

/** Narrow callbacks and observable state supplied by the Models plugin. */
export interface ProviderSignInInjected {
  hooks: { authorization: SnapshotStore<ProviderSignInState> }
  start: (provider: ProviderDirectoryEntry, method: string) => void
  cancel: () => void
  answer: (id: string, value: string) => void
  signOut: (key: string) => void
  selectModel: (provider: string, model: string) => void
  retry: (provider: ProviderDirectoryEntry) => void
  t: (key: keyof typeof authorizationEn) => string
}

/** Provider-card owner data and injected login operations. */
export type ProviderSignInProps = PropsRuntime<'settings.models.provider-card'> & InjectFace<ProviderSignInInjected>

/**
 * Render subscription login, browser verification and model selection for one provider.
 * @param props - provider identity and injected login state.
 * @returns the provider's login controls, or null when it offers no OAuth flow.
 */
export function ProviderSignIn({ provider, useAuthorization, start, cancel, answer, signOut, selectModel, retry, t }: ProviderSignInProps) {
  const state = useAuthorization(snapshot => snapshot)
  const key = `${provider.settingsNs}/${provider.provider}`
  const entry = state.entries.find(candidate => candidate.key === key)
  const methods = entry?.methods.filter(method => method.id === 'oauth') ?? []
  const [input, setInput] = useState({ id: '', value: '' })
  if (!methods.length) return state.failed
    ? <button className={formStyles.secondaryButton} type="button" onClick={() => { retry(provider) }}>{t('retry')}</button> : null
  const active = state.activeKey === key
  const frame = active ? state.frame : undefined
  const prompt = frame?.prompt
  const value = input.id === prompt?.id ? input.value : ''
  const models = state.models.filter(model => model.provider === provider.provider)
  const selected = state.defaultModel?.provider === provider.provider ? state.defaultModel.model : ''
  const url = frame?.notice?.url
  const browserUrl = url !== undefined && /^https?:\/\//i.test(url) ? url : undefined
  return <div className={styles.card}>
    {entry?.signedIn ? <>
      <span>{t('signedIn')}</span>
      <button className={formStyles.secondaryButton} type="button" disabled={state.busy} onClick={() => { signOut(key) }}>{t('signOut')}</button>
      <label>{t('model')}
        <select className={`${formStyles.input} ${formStyles.selectInput}`} value={selected} disabled={state.busy || models.length === 0}
          onChange={(event) => { selectModel(provider.provider, event.target.value) }}>
          <option value="" disabled>{t('chooseModel')}</option>
          {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
        </select>
      </label>
      {selected ? <span role="status">{t('defaultSaved')}</span> : null}
    </> : methods.map(method => <button className={formStyles.primaryButton} type="button" key={method.id} disabled={state.busy || entry?.inFlight}
      onClick={() => { start(provider, method.id) }}>{provider.provider === 'openai' ? t('signIn')
        : provider.provider === 'openai-codex' ? t('codexSignIn') : method.label}</button>)}
    {active && state.busy ? <>
      <span role="status">{frame?.notice?.message ?? t('working')}</span>
      {browserUrl ? <a href={browserUrl} target="_blank" rel="noopener noreferrer">{t('openBrowser')}</a> : null}
      {frame?.notice?.code ? <code>{frame.notice.code}</code> : null}
      {prompt ? <form onSubmit={(event) => { event.preventDefault(); answer(prompt.id, value); setInput({ id: '', value: '' }) }}>
        <label>{prompt.message}
          {prompt.kind === 'select'
            ? <select className={`${formStyles.input} ${formStyles.selectInput}`} value={value}
              onChange={(event) => { setInput({ id: prompt.id, value: event.target.value }) }}>
              <option value="" disabled>{t('submit')}</option>
              {prompt.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            : <input className={formStyles.input} type={prompt.kind === 'secret' ? 'password' : 'text'} value={value} autoComplete="off"
              placeholder={prompt.placeholder} onChange={(event) => { setInput({ id: prompt.id, value: event.target.value }) }} />}
        </label>
        <button className={formStyles.primaryButton} type="submit" disabled={!value}>{t('submit')}</button>
      </form> : null}
      <button className={formStyles.secondaryButton} type="button" onClick={cancel}>{t('cancel')}</button>
    </> : null}
    {active && state.failed ? <div role="alert">{t('failed')}
      <button className={formStyles.secondaryButton} type="button" disabled={state.busy} onClick={() => { retry(provider) }}>{t('retry')}</button>
    </div> : null}
  </div>
}
