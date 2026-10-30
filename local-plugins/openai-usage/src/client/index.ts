/** Independent browser contribution for local OpenAI subscription quotas. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { QuotaCard } from './QuotaCard.tsx'
import { en, zh } from './locales.ts'
import { pollQuota } from './resource.ts'

/** Services required by this independent local browser plugin. */
export const inject = ['slots', 'locale', 'resources']

/**
 * Register typed dictionaries, one polled resource, and a lifecycle-bound footer contribution.
 * @param ctx - Client plugin context; all contributions unwind with its fiber.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('local-openai-usage', { en, zh }), 'local-openai-usage: locales')
  ctx.effect(() => ctx.resources.register<'local-openai-usage'>({
    protocol: 'local-openai-usage',
    open: (_address, { signal }) => pollQuota(signal),
  }), 'local-openai-usage: quota resource')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'openai-usage', locale: 'local-openai-usage',
  }, QuotaCard))
}
