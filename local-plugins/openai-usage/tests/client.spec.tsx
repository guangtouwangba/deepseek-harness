// @vitest-environment jsdom
import '../../../scripts/test-dom-environment.ts'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '../../../packages/client/ui-renderer/src/client/registry.ts'
import { ResourceRegistry } from '../../../packages/client/resources/src/client/resources.ts'
import { apply, inject } from '../src/client/index.ts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { QuotaCard, QuotaCardView } from '../src/client/QuotaCard.tsx'
import type { UseResource } from '@deepseek-ai/dsh-client-resources/client'
import { en, zh } from '../src/client/locales.ts'
import { pollQuota } from '../src/client/resource.ts'
import type { QuotaReady } from '../src/client/types.ts'

const fixture: QuotaReady = {
  status: 'ready', provider: 'openai-codex', planType: 'plus',
  weekly: { usedPercent: 28, remainingPercent: 72, windowSeconds: 604800, resetsAt: '2026-11-05T08:00:00.000Z' },
  shortTerm: { usedPercent: 14, remainingPercent: 86, windowSeconds: 18000, resetsAt: null },
  fetchedAt: '2026-10-30T06:00:00.000Z', refreshIntervalMs: 60000,
}
const live = { status: 'live' as const, value: fixture, failure: undefined }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('subscription quota card', () => {
  it('reads the quota only through its framework resource hook', () => {
    const useResource = vi.fn(() => live) as UseResource
    render(<QuotaCard wide t={makeTranslate(en)} useResource={useResource} />)
    expect(useResource).toHaveBeenCalledWith('dsh-resource://local-openai-usage/current')
    expect(screen.getByText('72% remaining')).toBeTruthy()
  })
  it('identifies the reused local Codex login on the card', () => {
    render(<QuotaCardView wide resource={{ ...live, value: { ...fixture, credentialSource: 'codex-cli' } }} t={makeTranslate(en)} />)
    expect(screen.getByText('Local Codex login')).toBeTruthy()
  })
  it.each(['codex-cli-expired', 'codex-cli-unavailable'] as const)('hides old account values for a %s login failure', reason => {
    render(<QuotaCardView wide resource={{ status: 'failed', value: fixture, failure: { code: 'local-openai-usage/error', details: { reason }, message: reason, name: 'RemoteError', isDSHRemoteError: true } }} t={makeTranslate(zh)} />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('本机 Codex')
  })
  it('presents a known zero without confusing it with unknown data', () => {
    render(<QuotaCardView wide resource={{ ...live, value: { ...fixture, weekly: { usedPercent: 100, remainingPercent: 0, windowSeconds: 604800, resetsAt: null }, shortTerm: null } }} t={makeTranslate(en)} />)
    expect(screen.getByText('0% remaining')).toBeTruthy()
    expect(screen.getByText('Reset time unavailable')).toBeTruthy()
    expect(screen.queryByText('Short window')).toBeNull()
  })
  it('shows weekly remaining and reset plus the short window', () => {
    render(<QuotaCardView wide resource={live} t={makeTranslate(en)} />)
    expect(screen.getByText('Weekly')).toBeTruthy()
    expect(screen.getByText('72% remaining')).toBeTruthy()
    expect(screen.getByText('86% remaining')).toBeTruthy()
    expect(document.querySelector('time')?.dateTime).toBe(fixture.weekly?.resetsAt)
    expect(screen.getByRole('meter', { name: 'Weekly' }).getAttribute('aria-valuenow')).toBe('72')
  })
  it('does not turn an unknown weekly quota or reset into zero', () => {
    render(<QuotaCardView wide resource={{ ...live, value: { ...fixture, weekly: null, shortTerm: null } }} t={makeTranslate(en)} />)
    expect(screen.getByText('Weekly quota unavailable')).toBeTruthy()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByText('0% remaining')).toBeNull()
  })
  it('retains a good quota visibly marked stale after refresh failure', () => {
    render(<QuotaCardView wide resource={{ status: 'failed', value: fixture, failure: { code: 'local-openai-usage/error', details: { reason: 'timeout' }, message: 'timeout', name: 'RemoteError', isDSHRemoteError: true } }} t={makeTranslate(en)} />)
    expect(screen.getByText('72% remaining')).toBeTruthy()
    expect(screen.getByText('Out of date')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Refresh timed out')
  })
  it('hides previous account quota when authentication is no longer available', () => {
    render(<QuotaCardView wide resource={{ status: 'failed', value: fixture, failure: { code: 'local-openai-usage/error', details: { reason: 'auth-required' }, message: 'auth-required', name: 'RemoteError', isDSHRemoteError: true } }} t={makeTranslate(en)} />)
    expect(screen.queryByText('72% remaining')).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Codex')
  })
  it('uses localized signed-out and unavailable states without quota numbers', () => {
    const view = render(<QuotaCardView wide resource={{ status: 'failed', value: undefined, failure: { code: 'local-openai-usage/error', details: { reason: 'auth-required' }, message: 'auth-required', name: 'RemoteError', isDSHRemoteError: true } }} t={makeTranslate(zh)} />)
    expect(screen.getByText(zh['auth-required'])).toBeTruthy()
    view.rerender(<QuotaCardView wide resource={{ status: 'loading', value: undefined, failure: undefined }} t={makeTranslate(en)} />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Loading')
  })
  it('keeps the same focusable icon control when sidebar width changes', () => {
    const view = render(<QuotaCardView wide resource={live} t={makeTranslate(en)} />)
    const button = screen.getByRole('button')
    button.focus()
    view.rerender(<QuotaCardView wide={false} resource={live} t={makeTranslate(en)} />)
    expect(screen.getByRole('button')).toBe(button)
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-label')).toContain('72% remaining')
    fireEvent.click(button)
    expect(screen.getByRole('tooltip').textContent).toContain('72% remaining')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('records owner-local fixture output', async () => {
    const local = { ...live, value: { ...fixture, credentialSource: 'codex-cli' as const } }
    const view = render(<QuotaCardView wide resource={local} t={makeTranslate(en)} />)
    const wide = view.container.textContent
    view.rerender(<QuotaCardView wide={false} resource={local} t={makeTranslate(zh)} />)
    await expect(JSON.stringify({ wide, narrow: screen.getByRole('button').getAttribute('aria-label') }, null, 2) + '\n').toMatchFileSnapshot('./expected/quota-card.expected.json')
  })
})

function FixtureRoot({ renderSlot }: import('@deepseek-ai/dsh-client-ui-slots').PropsRenderSlots<'sidebar.footer.action'>) {
  return <>{renderSlot('sidebar.footer.action', { wide: true })}</>
}

it('waits for the footer declaration and releases quota polling on plugin unload', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(fixture))))
  vi.stubGlobal('fetch', fetcher)
  const ctx = new Context()
  new SlotRegistry(ctx)
  const resources = new ResourceRegistry(ctx)
  ctx.provide('resources', resources)
  const dropLocale = vi.fn()
  ctx.provide('locale', { register: () => dropLocale })
  const plugin = ctx.plugin({ inject, apply })
  onTestFinished(async () => { await plugin.dispose() })
  await plugin.await()
  expect(ctx.slots.entriesOfSlot('sidebar.footer.action')).toHaveLength(0)
  const removeRoot = ctx.slots.register({ name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } } }, FixtureRoot)
  onTestFinished(async () => { await removeRoot() })
  expect(ctx.slots.entriesOfSlot('sidebar.footer.action').map(entry => entry.options.id)).toEqual(['openai-usage'])
  const source = resources.source('dsh-resource://local-openai-usage/current')
  const unsubscribe = source.subscribe(() => {})
  onTestFinished(unsubscribe)
  await vi.advanceTimersByTimeAsync(0)
  expect(source.getSnapshot()).toMatchObject({ status: 'live', value: fixture })
  expect(fetcher).toHaveBeenCalledOnce()
  await plugin.dispose()
  expect(ctx.slots.entriesOfSlot('sidebar.footer.action')).toHaveLength(0)
  expect(source.getSnapshot().status).toBe('none')
  expect(dropLocale).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  await removeRoot()
})

describe('quota polling resource', () => {
  it('fetches the relative authenticated endpoint and honors host polling interval', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...fixture, refreshIntervalMs: 120000 })))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    const stream = pollQuota(controller.signal)
    expect((await stream.next()).value).toEqual({ ok: true, value: { ...fixture, refreshIntervalMs: 120000 } })
    expect(fetcher).toHaveBeenCalledWith('api/local-openai-usage', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }))
    const next = stream.next()
    await vi.advanceTimersByTimeAsync(119999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    controller.abort()
    expect((await next).done).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('reports failures as frames and later recovers without losing a good frame', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fixture))).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response(JSON.stringify(fixture))))
    const controller = new AbortController()
    const stream = pollQuota(controller.signal)
    expect((await stream.next()).value?.ok).toBe(true)
    const failed = stream.next(); await vi.advanceTimersByTimeAsync(60000)
    expect((await failed).value).toMatchObject({ ok: false, error: { details: { reason: 'request-failed' } } })
    const recovered = stream.next(); await vi.advanceTimersByTimeAsync(60000)
    expect((await recovered).value?.ok).toBe(true)
    controller.abort(); await stream.next()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the last host interval after a transport failure', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...fixture, refreshIntervalMs: 120000 }))).mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController(); const stream = pollQuota(controller.signal)
    await stream.next()
    const failed = stream.next(); await vi.advanceTimersByTimeAsync(120000); await failed
    const next = stream.next(); await vi.advanceTimersByTimeAsync(119999)
    expect(fetcher).toHaveBeenCalledTimes(2)
    controller.abort(); await next
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    ['signed-out', 'auth-required'], ['unsupported', 'subscription-required'], ['error', 'rate-limited'],
    ['error', 'codex-cli-expired'], ['error', 'codex-cli-unavailable'],
  ])('maps %s responses into localized failure reasons', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status, code, refreshIntervalMs: 60000 }))))
    const controller = new AbortController(); const stream = pollQuota(controller.signal)
    expect((await stream.next()).value).toMatchObject({ ok: false, error: { details: { reason: code } } })
    controller.abort(); await stream.next()
  })
  it.each([{}, { ...fixture, weekly: { ...fixture.weekly, remainingPercent: -1 } }, { ...fixture, refreshIntervalMs: 0 }, { ...fixture, fetchedAt: 'invalid' }])('rejects malformed host data without a tight polling loop', async (value) => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController(); const stream = pollQuota(controller.signal)
    expect((await stream.next()).value).toMatchObject({ ok: false, error: { details: { reason: 'invalid-response' } } })
    const next = stream.next(); await vi.advanceTimersByTimeAsync(59999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    controller.abort(); await next
  })
  it.each([[401, 'auth-required'], [403, 'auth-required'], [429, 'rate-limited'], [502, 'request-failed']] as const)('maps HTTP %s into a safe failure frame', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream body is not displayed', { status })))
    const controller = new AbortController(); const stream = pollQuota(controller.signal)
    expect((await stream.next()).value).toMatchObject({ ok: false, error: { details: { reason: code } } })
    controller.abort(); await stream.next()
  })
  it('reports malformed JSON as unreadable data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json')))
    const controller = new AbortController(); const stream = pollQuota(controller.signal)
    expect((await stream.next()).value).toMatchObject({ ok: false, error: { details: { reason: 'invalid-response' } } })
    controller.abort(); await stream.next()
  })
  it('does not open an already-aborted resource', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController(); controller.abort()
    expect((await pollQuota(controller.signal).next()).done).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('aborts an in-flight fetch without publishing a late failure', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const stream = pollQuota(controller.signal)
    const pending = stream.next()
    controller.abort()
    expect((await pending).done).toBe(true)
  })
})
