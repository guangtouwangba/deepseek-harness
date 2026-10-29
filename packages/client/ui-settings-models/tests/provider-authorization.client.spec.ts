import { expect, it } from 'vitest'
import { frames, ok, openStream, RemoteMock } from '@deepseek-ai/dsh-remote-mock'
import { ProviderSignInController } from '../src/client/provider-authorization.ts'

const provider = { provider: 'openai-codex', displayName: 'ChatGPT', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai-codex'], active: false }

function bench(profile?: object) {
  const mock = RemoteMock.create().load({ unary: {
    'providerAuthorization/list': ok([{ key: 'llm-pi-ai/openai-codex', label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Login' }], signedIn: true, inFlight: false }]),
    'session/modelCatalog': ok({ default: { provider: 'deepseek-official', model: 'deepseek-flash' },
      groups: [{ id: 'openai-codex', name: 'ChatGPT', models: [{ id: 'gpt-test', name: 'Test model' }] }], routableProviders: ['openai-codex'], failures: [] }),
    'settings/describe': ok({ writable: true, hasDocument: true, namespaces: [{ ns: 'llm-pi-ai', revision: 7, value: { providers: profile ? { 'openai-codex': profile } : {} } }] }),
    'settings/mutate': ok({}), 'settings/replace': ok({}), 'providerAuthorization/signOut': ok(undefined),
  } })
  mock.stream('providerAuthorization/login', frames([{ status: 'authorized' }]))
  const controller = new ProviderSignInController(mock.remote)
  return { mock, controller }
}

it('activates an OAuth route after authorization without storing an API key or choosing a model implicitly', async () => {
  const { mock, controller } = bench()
  await controller.start(provider, 'oauth')
  expect(mock.remote.settings.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['providers', 'openai-codex'], value: {} }], 7)
  expect(mock.remote.settings.replace).not.toHaveBeenCalled()
  expect(controller.store.getSnapshot()).toMatchObject({ busy: false, failed: false, models: [{ id: 'gpt-test', provider: 'openai-codex' }] })
  mock.assertNoUnmatched()
  controller.dispose()
})

it('preserves existing provider configuration on reauthorization', async () => {
  const { mock, controller } = bench({ models: [{ id: 'custom' }] })
  await controller.start(provider, 'oauth')
  expect(mock.remote.settings.mutate).not.toHaveBeenCalled()
  controller.dispose()
})

it('only saves a default explicitly selected from the current catalog', async () => {
  const { mock, controller } = bench()
  await controller.refresh()
  await controller.selectModel('openai-codex', 'not-in-catalog')
  expect(mock.remote.settings.replace).not.toHaveBeenCalled()
  await controller.selectModel('openai-codex', 'gpt-test')
  expect(mock.remote.settings.replace).toHaveBeenCalledWith('agent-default-model', { provider: 'openai-codex', model: 'gpt-test' }, undefined)
  controller.dispose()
})

it('cancels the stream on disposal without activating the provider', async () => {
  const { mock, controller } = bench()
  mock.stream('providerAuthorization/login', openStream([{ status: 'running' }]))
  const pending = controller.start(provider, 'oauth')
  await mock.streams.opened('providerAuthorization/login', 1)
  controller.dispose()
  await pending
  expect(mock.remote.settings.mutate).not.toHaveBeenCalled()
})
