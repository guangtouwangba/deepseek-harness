import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { expect, it, onTestFinished } from 'vitest'
import { openAIInstallationId } from '../src/openai-installation.ts'

it('shares one installation UUID across concurrent requests and process restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-openai-installation-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'credentials.yaml')
  const first = new Context()
  await first.plugin(LocalCredentialProvider, { path, watch: false })
  onTestFinished(() => first.fiber.dispose())
  const ids = await Promise.all(Array.from({ length: 8 }, () => openAIInstallationId(first)))
  expect(new Set(ids).size).toBe(1)
  const second = new Context()
  await second.plugin(LocalCredentialProvider, { path, watch: false })
  onTestFinished(() => second.fiber.dispose())
  expect(await openAIInstallationId(second)).toBe(ids[0])
  await second.credentials.modifyRecord(credentialKey('llm-pi-ai-installation', 'openai'),
    () => Promise.resolve({ kind: 'grant', payload: 'invalid' }))
  await expect(openAIInstallationId(second)).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
})

it('refuses to start direct ChatGPT registration without persistent credential storage', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await expect(openAIInstallationId(ctx)).rejects.toMatchObject({ code: 'NO_CREDENTIAL_STORE' })
})
