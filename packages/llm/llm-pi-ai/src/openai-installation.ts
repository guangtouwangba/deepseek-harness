/** Installation identity used only by the direct ChatGPT OAuth registration. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'

/**
 * Read or atomically create a stable OpenAI registration identity in the local credential store.
 * The separate scope excludes installation metadata from pi-ai's provider credential inventory.
 * @param ctx - Host context with local credential storage.
 * @returns the same UUID across logins, sign-outs and process restarts.
 */
export async function openAIInstallationId(ctx: Context): Promise<string> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) throw new LlmError('ChatGPT sign-in requires a credential store.', 'NO_CREDENTIAL_STORE')
  const stored = await credentials.modifyRecord(credentialKey('llm-pi-ai-installation', 'openai'),
    current => Promise.resolve(current ?? { kind: 'grant', payload: randomUUID() }))
  if (stored?.kind !== 'grant' || typeof stored.payload !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored.payload)) {
    throw new LlmError('The stored ChatGPT installation identity is invalid.', 'INVALID_CREDENTIAL')
  }
  return stored.payload
}
