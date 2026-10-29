// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProviderSignIn } from '../src/client/ProviderSignIn.tsx'
import type { ProviderSignInProps, ProviderSignInState } from '../src/client/ProviderSignIn.tsx'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { authorizationEn } from '../src/client/authorization-copy.ts'

afterEach(cleanup)

function initial(): ProviderSignInState {
  return { entries: [{ key: 'llm-pi-ai/openai', label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }], inFlight: false, signedIn: false }], models: [], busy: false, loaded: true }
}

function props(): ProviderSignInProps {
  return {
    provider: { provider: 'openai', displayName: 'ChatGPT', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: false },
    configured: false, keyConfigured: false,
    useAuthorization: bindSnapshotSelector(createSnapshotStore(initial())),
    start: vi.fn(), cancel: vi.fn(), answer: vi.fn(), signOut: vi.fn(), selectModel: vi.fn(), retry: vi.fn(),
    t: (key: keyof typeof authorizationEn) => authorizationEn[key],
  } as ProviderSignInProps
}

it('offers subscription login without requesting an API key', () => {
  const input = props()
  render(<ProviderSignIn {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }))
  expect(input.start).toHaveBeenCalledWith(input.provider, 'oauth')
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('shows the verification link, code and manual callback prompt', () => {
  const input = props()
  const state = { ...initial(), busy: true, activeKey: 'llm-pi-ai/openai', frame: {
    status: 'running' as const, notice: { message: 'Verify', url: 'https://auth.openai.com/authorize', code: '1234' },
    prompt: { id: 'prompt-1', kind: 'text' as const, message: 'Paste callback' },
  } }
  render(<ProviderSignIn {...input} useAuthorization={bindSnapshotSelector(createSnapshotStore(state))} />)
  expect(screen.getByRole('link', { name: authorizationEn.openBrowser }).getAttribute('href')).toBe('https://auth.openai.com/authorize')
  expect(screen.getByText('1234')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Paste callback'), { target: { value: 'callback' } })
  fireEvent.click(screen.getByRole('button', { name: authorizationEn.submit }))
  expect(input.answer).toHaveBeenCalledWith('prompt-1', 'callback')
  fireEvent.click(screen.getByRole('button', { name: authorizationEn.cancel }))
  expect(input.cancel).toHaveBeenCalled()
})

it('labels legacy Codex separately instead of presenting it as direct ChatGPT sign-in', () => {
  const input = props()
  const state = initial()
  state.entries[0]!.key = 'llm-pi-ai/openai-codex'
  render(<ProviderSignIn {...input} provider={{ ...input.provider, provider: 'openai-codex' }}
    useAuthorization={bindSnapshotSelector(createSnapshotStore(state))} />)
  fireEvent.click(screen.getByRole('button', { name: authorizationEn.codexSignIn }))
  expect(input.start).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai-codex' }), 'oauth')
  expect(screen.queryByRole('button', { name: authorizationEn.signIn })).toBeNull()
})
