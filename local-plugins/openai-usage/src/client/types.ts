/** Sanitized subscription quota fields returned by the local Host endpoint. */
export interface QuotaWindow {
  readonly usedPercent: number
  readonly remainingPercent: number
  readonly windowSeconds: number
  readonly resetsAt: string | null
}

/** Successful quota read; missing windows are unknown, never empty. */
export interface QuotaReady {
  readonly status: 'ready'
  readonly provider: 'openai' | 'openai-codex'
  readonly credentialSource?: 'harness' | 'codex-cli' | undefined
  readonly planType: string | null
  readonly weekly: QuotaWindow | null
  readonly shortTerm: QuotaWindow | null
  readonly fetchedAt: string
  readonly refreshIntervalMs: number
}

/** Stable failure reasons shared with the local Host endpoint. */
export type QuotaErrorCode = 'auth-required' | 'subscription-required' | 'request-failed' | 'invalid-response' | 'rate-limited' | 'timeout' | 'codex-cli-expired' | 'codex-cli-unavailable'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    /** Local OpenAI subscription quota, shared by all mounted quota cards. */
    'local-openai-usage': QuotaReady
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Local quota reads retain the last good value after these failures. */
    'local-openai-usage/error': { readonly reason: QuotaErrorCode }
  }
}
