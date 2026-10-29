/** Subscription login through the real Web composition with a synthetic authorization issuer. */
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('authorizes, selects a default, survives reload and signs out without exposing the grant', async () => {
  const scaffold = await launchWebScaffold({})
  const browser = await chromium.launch()
  try {
    const key = credentialKey('llm-pi-ai', 'subscription-fixture')
    scaffold.ctx.authorization.registerFlow({
      key, label: 'Fixture subscription', methods: [{ id: 'oauth', label: 'Sign in with fixture subscription' }],
      async run(session) {
        session.notify({ message: 'Verify subscription', url: 'https://example.com/verify', code: 'FIXTURE' })
        const code = await session.prompt({ kind: 'text', message: 'Paste verification code' })
        if (code !== 'approved') throw new Error('Rejected by fixture issuer')
        await session.commit({ kind: 'grant', payload: { type: 'oauth', access: 'fixture-secret', refresh: 'fixture-refresh', expires: 4102444800000 } })
      },
    })
    await scaffold.ctx.settings.update('llm-pi-ai', { providers: { 'subscription-fixture': {
      displayName: 'Fixture subscription', api: 'openai-completions', baseURL: 'http://127.0.0.1:1/v1',
      models: [{ id: 'fixture-model', name: 'Fixture model' }],
    } } })
    const page = await browser.newPage({ locale: ZH_BROWSER_LOCALE, viewport: { width: 1280, height: 900 } })
    const consoleWatch = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl)
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSettings(page, 'zh')
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    await dialog.getByRole('button', { name: 'Sign in with fixture subscription', exact: true }).click()
    await dialog.getByLabel('Paste verification code').waitFor()
    const other = await browser.newPage({ locale: ZH_BROWSER_LOCALE })
    await other.goto(scaffold.authenticatedUrl)
    await other.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSettings(other, 'zh')
    await other.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '模型', exact: true }).click()
    const otherLogin = other.getByRole('button', { name: 'Sign in with fixture subscription', exact: true })
    await expect.poll(() => otherLogin.isDisabled()).toBe(true)
    await dialog.getByRole('button', { name: '取消登录', exact: true }).click()
    await expect.poll(() => otherLogin.isEnabled()).toBe(true)
    await other.close()
    await dialog.getByRole('button', { name: 'Sign in with fixture subscription', exact: true }).click()
    await dialog.getByLabel('Paste verification code').fill('approved')
    await dialog.getByRole('button', { name: '继续', exact: true }).click()
    const signOut = dialog.getByRole('button', { name: '退出登录', exact: true })
    await signOut.waitFor()
    const model = dialog.getByRole('combobox', { name: '模型', exact: true })
    await model.selectOption('fixture-model')
    await dialog.getByRole('status').filter({ hasText: '已保存默认模型' }).waitFor()
    expect(scaffold.ctx.agentDefaultModel.currentSelection()).toMatchObject({ provider: 'subscription-fixture', model: 'fixture-model' })
    expect(await page.locator('body').innerText()).not.toContain('fixture-secret')
    await page.reload()
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await openSettings(page, 'zh')
    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    await signOut.click()
    await dialog.getByRole('button', { name: 'Sign in with fixture subscription', exact: true }).waitFor()
    expect(await scaffold.ctx.credentials.readRecord(key)).toBeUndefined()
    expect(consoleWatch.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 60_000)

it('resumes default-model selection after reloading with a stored ChatGPT grant', async () => {
  const scaffold = await launchWebScaffold({ deepSeekMissingCredential: true })
  const browser = await chromium.launch()
  try {
    const key = credentialKey('llm-pi-ai', 'openai-codex')
    await scaffold.ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: {
      type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: 4102444800000,
    } }))
    await scaffold.ctx.settings.update('llm-pi-ai', { providers: { 'openai-codex': {} } })
    const page = await browser.newPage({ locale: ZH_BROWSER_LOCALE })
    await page.goto(scaffold.authenticatedUrl)
    const subscription = page.getByRole('dialog', { name: 'ChatGPT 订阅', exact: true })
    await subscription.waitFor({ timeout: 15_000 })
    const select = subscription.getByRole('combobox', { name: '模型', exact: true })
    await expect.poll(() => select.isEnabled()).toBe(true)
    const model = await select.locator('option').nth(1).getAttribute('value')
    expect(model).toBeTruthy()
    await select.selectOption(model)
    await subscription.getByRole('status').filter({ hasText: '已保存默认模型' }).waitFor()
    await subscription.getByRole('button', { name: '开始对话', exact: true }).click()
    await subscription.waitFor({ state: 'detached', timeout: 15_000 })
    expect(scaffold.ctx.agentDefaultModel.currentSelection()).toMatchObject({ provider: 'openai-codex', model })
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 60_000)
