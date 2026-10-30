/** Locale-owned quota card copy and formatter locale. */
export const en = {
  title: 'OpenAI quota', weekly: 'Weekly', short: 'Short window', remaining: '{percent} remaining',
  'weekly-unknown': 'Weekly quota unavailable', 'reset-unknown': 'Reset time unavailable',
  resets: 'Resets {time}', updated: 'Updated {time}', plan: 'Plan: {plan}',
  stale: 'Out of date', loading: 'Loading quota', unavailable: 'Quota unavailable',
  'auth-required': 'No Codex login found in Harness or the local Codex CLI.',
  'subscription-required': 'No compatible Codex quota is available. Direct ChatGPT login is separate.',
  'codex-cli-expired': 'Local Codex login has expired or was rejected. Renew it in Codex.',
  'codex-cli-unavailable': 'Could not read the local Codex login. Check its login file.',
  'source-cli': 'Local Codex login', 'source-harness': 'Harness Codex login',
  'request-failed': 'Could not refresh quota. Retrying automatically.',
  'invalid-response': 'Quota data could not be read. Retrying automatically.',
  'rate-limited': 'Quota refresh is rate limited. Retrying automatically.',
  timeout: 'Refresh timed out. Retrying automatically.',
  'date-locale': 'en-US',
}

/** Chinese copy, checked against the English dictionary. */
export const zh: Record<keyof typeof en, string> = {
  title: 'OpenAI 配额', weekly: '每周', short: '短时窗口', remaining: '剩余 {percent}',
  'weekly-unknown': '每周配额未知', 'reset-unknown': '重置时间未知',
  resets: '{time} 重置', updated: '更新于 {time}', plan: '订阅：{plan}',
  stale: '数据已过期', loading: '正在加载配额', unavailable: '配额暂不可用',
  'auth-required': '未找到 Harness 或本机 Codex 的登录，请在任意一处登录 Codex',
  'subscription-required': '当前没有可查询的 Codex 额度；直接 ChatGPT 登录与此独立',
  'codex-cli-expired': '本机 Codex 登录已过期或被拒绝，请在 Codex 中更新授权',
  'codex-cli-unavailable': '无法读取本机 Codex 登录，请检查其登录文件',
  'source-cli': '复用本机 Codex 登录', 'source-harness': '复用 Harness Codex 登录',
  'request-failed': '配额刷新失败，将自动重试',
  'invalid-response': '无法读取配额数据，将自动重试',
  'rate-limited': '配额刷新受限，将自动重试',
  timeout: '配额刷新超时，将自动重试',
  'date-locale': 'zh-CN',
}

/** Keys owned by the independent local plugin. */
export type QuotaLocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Independent local OpenAI subscription quota card. */
    'local-openai-usage': QuotaLocaleKey
  }
}
