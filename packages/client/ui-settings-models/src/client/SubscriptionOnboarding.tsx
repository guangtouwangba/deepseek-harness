/** First-run subscription choice using the same login state as Models settings. */
import { useEffect } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelsSettingsState } from './store.ts'
import { onboardingReadiness } from './store.ts'
import { ProviderSignIn, type ProviderSignInInjected } from './ProviderSignIn.tsx'
import { OnboardingModal } from './OnboardingModal.tsx'
import styles from './ProviderSignIn.module.css'
import formStyles from './ModelsSection.module.css'

/** First-run enablement and the shared Models-page snapshot. */
export interface SubscriptionOnboardingInjected extends ProviderSignInInjected {
  automatic: boolean
  loadModels: () => void
  hooks: ProviderSignInInjected['hooks'] & { models: SnapshotStore<ModelsSettingsState> }
}

/**
 * Offer ChatGPT before the API-key setup step, preserving explicit provider choice.
 * @param props - onboarding progression and shared login state.
 * @returns a subscription choice dialog while first-run credentials are missing.
 */
export function SubscriptionOnboarding(props: PropsRuntime<'settings.onboarding'> & InjectFace<SubscriptionOnboardingInjected>) {
  const { useModels, useAuthorization, automatic, complete, loadModels, t } = props
  const models = useModels(snapshot => snapshot)
  const state = useAuthorization(snapshot => snapshot)
  const readiness = onboardingReadiness(models)
  const provider = models.rows.find(row => row.entry.provider === 'openai' && row.entry.settingsNs === 'llm-pi-ai')
  const active = state.activeKey === 'llm-pi-ai/openai'
  const signedIn = state.entries.some(entry => entry.key === 'llm-pi-ai/openai' && entry.signedIn)
  const needsModel = signedIn && !state.models.some(model =>
    model.provider === state.defaultModel?.provider && model.id === state.defaultModel.model)
  const skip = !automatic || (models.status === 'ready' && provider === undefined)
    || (!active && state.loaded && !needsModel && readiness.kind !== 'loading' && readiness.kind !== 'credential-missing')
  useEffect(() => { if (automatic && models.status === 'idle') loadModels() }, [automatic, models.status, loadModels])
  useEffect(() => { if (skip) complete() }, [skip, complete])
  if (skip || readiness.kind === 'loading' || provider === undefined) return null
  const ready = signedIn && state.defaultModel?.provider === 'openai'
  return <OnboardingModal title={t('title')}>
    <p>{t('description')}</p>
    <ProviderSignIn {...props} provider={provider.entry} configured={provider.configured} keyConfigured={false} />
    <div className={styles.card}>
      {ready ? <button className={formStyles.primaryButton} type="button" disabled={state.busy} onClick={complete}>{t('finish')}</button> : null}
      <button className={formStyles.secondaryButton} type="button" disabled={state.busy} onClick={complete}>{t('otherProviders')}</button>
    </div>
  </OnboardingModal>
}
