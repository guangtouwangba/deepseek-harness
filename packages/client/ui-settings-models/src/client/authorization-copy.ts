/** Copy for provider subscription sign-in. */
export const authorizationEn = {
  title: 'ChatGPT subscription',
  description: 'Use your ChatGPT subscription without an API key.',
  signIn: 'Sign in with ChatGPT',
  signedIn: 'Signed in',
  signOut: 'Sign out',
  openBrowser: 'Continue in browser',
  submit: 'Continue',
  cancel: 'Cancel sign-in',
  failed: 'Sign-in or setup failed. Try again.',
  retry: 'Retry',
  model: 'Model',
  chooseModel: 'Choose a model',
  defaultSaved: 'Default model saved',
  working: 'Signing in…',
  otherProviders: 'Use another provider',
  finish: 'Start chatting',
}

/** Chinese subscription sign-in copy. */
export const authorizationZh: Record<keyof typeof authorizationEn, string> = {
  title: 'ChatGPT 订阅',
  description: '使用 ChatGPT 订阅，无需 API Key',
  signIn: '使用 ChatGPT 登录',
  signedIn: '已登录',
  signOut: '退出登录',
  openBrowser: '在浏览器中继续',
  submit: '继续',
  cancel: '取消登录',
  failed: '登录或配置失败，请重试',
  retry: '重试',
  model: '模型',
  chooseModel: '选择模型',
  defaultSaved: '已保存默认模型',
  working: '正在登录…',
  otherProviders: '使用其他模型服务',
  finish: '开始对话',
}
