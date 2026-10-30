/** Pure quota presentation; the registered wrapper reads only the framework resource hook. */
import clsx from 'clsx'
import { IconClockOutlineRegular, IconWarningOutlineRegular, StateDot, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { QuotaReady } from './types.ts'
import type {} from './locales.ts'
import css from './QuotaCard.module.css'

type LocaleProps = PropsLocale<'local-openai-usage'>
type CardProps = Pick<PropsRuntime<'sidebar.footer.action'>, 'wide' | 'useResource'> & LocaleProps
type ViewProps = Pick<CardProps, 'wide' | 't'> & { readonly resource: ResourceSnapshot<QuotaReady> }

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value))
}

/**
 * Read the single shared quota resource through the renderer-owned hook.
 * @param props - Sidebar width, typed locale, and framework resource hook.
 * @returns Subscription quota card.
 */
export function QuotaCard({ wide, t, useResource }: CardProps) {
  return <QuotaCardView wide={wide} t={t} resource={useResource<'local-openai-usage'>('dsh-resource://local-openai-usage/current')} />
}

/**
 * Present known quotas and preserve stale values beside a localized refresh notice.
 * @param props - Sanitized quota snapshot, sidebar width, and locale share.
 * @returns One persistent tooltip control in wide and narrow sidebar layouts.
 */
export function QuotaCardView({ wide, resource, t }: ViewProps) {
  const { failure } = resource
  const authLost = resource.status === 'failed' && failure?.code === 'local-openai-usage/error'
    && (failure.details.reason === 'auth-required' || failure.details.reason === 'subscription-required'
      || failure.details.reason === 'codex-cli-expired' || failure.details.reason === 'codex-cli-unavailable')
  const value = authLost ? undefined : resource.value
  const locale = t('date-locale')
  const percent = (remaining: number): string => t('remaining', {
    percent: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(remaining / 100),
  })
  const error = resource.status === 'failed'
    ? t(failure?.code === 'local-openai-usage/error' ? failure.details.reason : 'request-failed')
    : undefined
  const loading = resource.status === 'loading'
  const weekly = value?.weekly
  const weeklyText = weekly == null ? t('weekly-unknown') : percent(weekly.remainingPercent)
  const resetText = weekly?.resetsAt == null ? t('reset-unknown') : t('resets', { time: formatDate(weekly.resetsAt, locale) })
  const shortText = value?.shortTerm == null ? undefined : percent(value.shortTerm.remainingPercent)
  const summary = value === undefined ? error ?? t(loading ? 'loading' : 'unavailable')
    : `${t('weekly')} · ${weeklyText} · ${resetText}${shortText === undefined ? '' : ` · ${t('short')} · ${shortText}`}`
  const source = value?.credentialSource === undefined ? undefined : t(value.credentialSource === 'codex-cli' ? 'source-cli' : 'source-harness')
  const label = `${t('title')} · ${summary}${source === undefined ? '' : ` · ${source}`}${error === undefined ? '' : ` · ${t('stale')} · ${error}`}`
  const details = [label, value?.planType == null ? undefined : t('plan', { plan: value.planType }),
    value === undefined ? undefined : t('updated', { time: formatDate(value.fetchedAt, locale) })].filter(Boolean).join('\n')
  return (
    <Tooltip label={details} portal side="right" openOnClick>
      <button type="button" className={clsx(css.card, !wide && css.narrow)} aria-label={label}>
        <span className={css.icon} aria-hidden="true">
          {loading ? <StateDot state="ongoing" /> : error === undefined ? <IconClockOutlineRegular size={16} /> : <IconWarningOutlineRegular size={16} />}
        </span>
        <span className={css.body}>
          <span className={css.heading}><span className={css.title}>{t('title')}</span>
            {error !== undefined && value !== undefined && <span className={css.stale}>{t('stale')}</span>}
          </span>
          {value !== undefined ? <>
            <span className={css.row}><span>{t('weekly')}</span><span className={css.percent}>{weeklyText}</span></span>
            {weekly != null && <span role="meter" aria-label={t('weekly')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={weekly.remainingPercent} className={css.track}>
              <span className={css.fill} style={{ width: `${weekly.remainingPercent}%` }} />
            </span>}
            <span className={css.secondary}>{weekly?.resetsAt == null ? resetText : <time dateTime={weekly.resetsAt}>{resetText}</time>}</span>
            {shortText !== undefined && <span className={clsx(css.row, css.secondary)}><span>{t('short')}</span><span>{shortText}</span></span>}
          </> : error === undefined && <span className={css.secondary}>{t(loading ? 'loading' : 'unavailable')}</span>}
          {source !== undefined && <span className={css.secondary}>{source}</span>}
          {error !== undefined && <span role="status" className={css.notice}>{error}</span>}
        </span>
      </button>
    </Tooltip>
  )
}
