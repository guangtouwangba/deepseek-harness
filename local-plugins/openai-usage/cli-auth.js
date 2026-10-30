/** Read-only reuse of Codex CLI's access token; the CLI retains exclusive refresh ownership. */
import { open } from 'node:fs/promises'
import { UsageError } from './usage.js'

const MAX_AUTH_BYTES = 1024 * 1024
const tokenText = value => typeof value === 'string' && value.length > 0 && !/[\s\x00-\x1f\x7f]/.test(value)

/**
 * Read the current local login without copying, refreshing or writing credentials.
 * @param path - Configured absolute auth.json path, or null to disable local reuse.
 * @param signal - Quota read lifetime; cancellation prevents publishing a late grant.
 * @returns A Codex bearer grant, or undefined when no compatible CLI login exists.
 */
export async function resolveCliAuth(path, signal) {
  signal?.throwIfAborted()
  if (path === null || path === undefined) return undefined
  let file
  let text
  try {
    file = await open(path, 'r')
    if (!(await file.stat()).isFile()) throw new UsageError('codex-cli-unavailable')
    const bytes = Buffer.alloc(MAX_AUTH_BYTES + 1)
    let size = 0
    while (size < bytes.length) {
      signal?.throwIfAborted()
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, size)
      if (bytesRead === 0) break
      size += bytesRead
    }
    if (size > MAX_AUTH_BYTES) throw new UsageError('codex-cli-unavailable')
    text = bytes.toString('utf8', 0, size)
  } catch (error) {
    signal?.throwIfAborted()
    if (error.code === 'ENOENT') return undefined
    throw new UsageError('codex-cli-unavailable')
  } finally {
    await file?.close()
  }
  signal?.throwIfAborted()
  let document
  try { document = JSON.parse(text) }
  catch (error) { throw new UsageError('codex-cli-unavailable') /* Never include local credential file contents. */ }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) throw new UsageError('codex-cli-unavailable')
  if (document.auth_mode !== undefined && document.auth_mode !== 'chatgpt') return undefined
  const tokens = document.tokens
  if (tokens === undefined || tokens === null) return undefined
  if (typeof tokens !== 'object' || !tokenText(tokens.access_token) || !tokenText(tokens.account_id)) throw new UsageError('codex-cli-unavailable')
  let claims
  try { claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString('utf8')) }
  catch (error) { throw new UsageError('codex-cli-unavailable') /* Token text must never reach diagnostics. */ }
  if (claims === null || typeof claims !== 'object' || !Number.isSafeInteger(claims.exp)) throw new UsageError('codex-cli-unavailable')
  if (claims.exp * 1000 <= Date.now()) throw new UsageError('codex-cli-expired')
  return { provider: 'openai-codex', source: 'codex-cli', accessToken: tokens.access_token, accountId: tokens.account_id }
}
