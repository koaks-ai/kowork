import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { CoreApplication } from '@kowork/core'
import type { KoWorkApi } from '@kowork/contracts'

const exec = promisify(execFile)

test('runs through the real Electron, preload, main and Core process chain', async ({
  browserName
}, testInfo) => {
  void browserName
  const dataPath = await mkdtemp(join(tmpdir(), 'kowork-e2e-'))
  const projectPath = join(dataPath, 'fixture-project')
  await mkdir(projectPath)
  await writeFile(join(projectPath, 'README.md'), '# Fixture\n\nInitial content.\n')
  await exec('git', ['init'], { cwd: projectPath })
  await exec('git', ['config', 'user.name', 'KoWork E2E'], { cwd: projectPath })
  await exec('git', ['config', 'user.email', 'kowork-e2e@example.invalid'], { cwd: projectPath })
  await exec('git', ['add', 'README.md'], { cwd: projectPath })
  await exec('git', ['commit', '-m', 'Initial fixture'], { cwd: projectPath })
  await writeFile(join(projectPath, 'README.md'), '# Fixture\n\nChanged content.\n')

  const seed = new CoreApplication(dataPath, undefined, true)
  const project = await seed.handle('projects.add', { rootPath: projectPath })
  await seed.handle('threads.create', { projectId: project.id, title: 'E2E 会话' })
  await seed.close()

  const environment = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value ? [[key, value]] : []))
  )
  delete environment.ELECTRON_RUN_AS_NODE
  const packagedExecutable = process.env.KOWORK_E2E_EXECUTABLE
  const electronApp = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable
      ? [`--user-data-dir=${dataPath}`]
      : [resolve('.'), `--user-data-dir=${dataPath}`],
    env: { ...environment, KOWORK_FAKE_AGENT: '1' }
  })

  try {
    let page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('button', { name: 'E2E 会话' })).toBeVisible()
    await expect(page.getByPlaceholder('给 KoWork 发消息…')).toBeVisible()
    const statusInformation = page.locator('[data-status-information]')
    await expect(statusInformation.getByRole('heading', { name: '状态信息' })).toBeVisible()
    await expect(statusInformation.getByText('+1', { exact: true })).toBeVisible()
    await expect(statusInformation.getByText('-1', { exact: true })).toBeVisible()
    await expect(statusInformation.getByText('本地', { exact: true })).toBeVisible()
    const brandBox = await page.locator('.app-brand').boundingBox()
    expect(brandBox).not.toBeNull()
    expect(brandBox!.x).toBe(0)
    expect(brandBox!.y).toBe(0)
    const logoPosition = await page.locator('.app-brand').evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const logo = range.getBoundingClientRect()
      return { left: logo.left, top: logo.top }
    })
    expect(logoPosition.left).toBe(16)
    expect(logoPosition.top).toBeGreaterThanOrEqual(44)
    expect((await page.locator('main > header').boundingBox())?.y).toBe(0)
    const inspectorHeaderBox = await page.getByRole('tablist').locator('..').boundingBox()
    const tabListBox = await page.getByRole('tablist').boundingBox()
    expect(inspectorHeaderBox).not.toBeNull()
    expect(tabListBox).not.toBeNull()
    expect(tabListBox!.y).toBeGreaterThanOrEqual(inspectorHeaderBox!.y)
    expect(tabListBox!.y + tabListBox!.height).toBeLessThanOrEqual(
      inspectorHeaderBox!.y + inspectorHeaderBox!.height
    )
    await expect(
      page.evaluate(() => ({
        hasKoWork: Object.hasOwn(window, 'kowork'),
        hasElectron: Object.hasOwn(window, 'electron'),
        hasRequire: typeof Reflect.get(window, 'require')
      }))
    ).resolves.toEqual({ hasKoWork: true, hasElectron: false, hasRequire: 'undefined' })

    await page.getByPlaceholder('给 KoWork 发消息…').fill('检查 README')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('我先确认一下当前项目。')).toBeVisible()
    const userMessage = page.locator('[data-user-message]').first()
    await expect(userMessage).toHaveCSS('border-radius', '16px')
    await expect(userMessage).toHaveCSS('padding', '6px 12px')
    await expect(userMessage.locator('.kowork-markdown')).toHaveCSS('font-size', '15px')
    await expect(userMessage.locator('p')).toHaveCSS('line-height', '28px')
    const firstReasoning = page
      .locator('article')
      .first()
      .locator('[data-run-content="reasoning"]')
      .first()
    const firstReasoningToggle = firstReasoning.getByRole('button', { name: '思考摘要' })
    const firstReasoningText = firstReasoning.locator('[data-reasoning-body]')
    const firstReasoningMarkdown = firstReasoning.locator('.kowork-markdown')
    await expect(firstReasoningToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(firstReasoningText).toHaveCSS('max-height', '240px')
    await expect(firstReasoningText).toHaveCSS('user-select', 'text')
    await expect(firstReasoningMarkdown).toHaveAttribute('data-tone', 'muted')
    await expect(firstReasoningMarkdown).toHaveCSS('filter', /grayscale/)
    await expect(firstReasoning.locator('strong')).toHaveText('README')
    const reasoningAlignment = await firstReasoning.evaluate((element) => ({
      toggleLeft: element.querySelector('button')?.getBoundingClientRect().left,
      textLeft: element.querySelector('[data-reasoning-body]')?.getBoundingClientRect().left
    }))
    expect(reasoningAlignment.textLeft).toBe(reasoningAlignment.toggleLeft)
    await expect(firstReasoning.getByText(/我会先确认项目中的 README/)).toBeVisible()
    await expect(page.getByText(/已收到任务：检查 README/)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('思考摘要').first()).toBeVisible()
    await expect(page.getByText('原始推理').first()).toBeVisible()
    await expect(page.getByText('read_file', { exact: true }).first()).toBeVisible()
    await expect(firstReasoningToggle).toHaveAttribute('aria-expanded', 'false')
    await firstReasoningToggle.click()
    await expect(firstReasoningToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(firstReasoningText).toHaveCSS('max-height', 'none')
    await firstReasoningToggle.click()
    await expect(firstReasoningToggle).toHaveAttribute('aria-expanded', 'false')
    const toolActivity = page
      .locator('[data-run-content="tool"]')
      .filter({ hasText: 'read_file' })
      .first()
    const toolToggle = toolActivity.getByRole('button')
    const toolContent = toolActivity.locator(':scope > div[aria-hidden]')
    await expect(toolToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toolContent).toHaveAttribute('aria-hidden', 'true')
    await toolToggle.click()
    await expect(toolToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toolContent).toHaveAttribute('aria-hidden', 'false')
    await expect(page.getByText('README.md 已读取，共 3 行。')).toBeVisible()
    await expect(page.getByRole('heading', { name: '检查结果', level: 3 })).toBeVisible()
    await expect(page.getByText('当前内容可正常访问')).toBeVisible()
    const reasoningActivities = page
      .locator('article')
      .first()
      .locator('[data-run-content="reasoning"]')
    await expect(reasoningActivities).toHaveCount(2)
    await expect(
      reasoningActivities.nth(1).getByRole('button', { name: '原始推理' })
    ).toHaveAttribute('aria-expanded', 'false')
    const traceActivity = page.locator('[data-run-content="trace"]').first()
    const traceToggle = traceActivity.getByRole('button', { name: /openai-responses/ })
    await expect(traceToggle).toHaveAttribute('aria-expanded', 'false')
    await traceToggle.click()
    await expect(traceToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(traceActivity.getByText('response.created').first()).toBeVisible()
    await expect(page.locator('[data-run-content="annotations"]')).toContainText('README.md')
    const orderedContent = page.locator('article').first().locator('[data-run-content]')
    await expect(orderedContent).toHaveCount(7)
    expect(
      await orderedContent.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-run-content'))
      )
    ).toEqual(['trace', 'text', 'reasoning', 'tool', 'reasoning', 'annotations', 'text'])
    expect(
      await orderedContent.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-output-kind'))
      )
    ).toEqual([null, 'process', null, null, null, null, 'final'])
    const copyAction = page.locator('[data-run-action="copy"]').first()
    await expect(copyAction).toHaveAttribute('aria-label', '复制最终回复', { timeout: 5_000 })
    await expect(page.getByRole('button', { name: '创建分支（暂不可用）' }).first()).toBeDisabled()
    await expect(page.getByText('已完成')).toHaveCount(0)
    await copyAction.click()
    await expect(copyAction).toHaveAttribute('aria-label', '已复制')
    await expect(copyAction.locator('.lucide-check')).toBeVisible()
    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(
        '已收到任务：检查 README\n\n### 检查结果\n\n- 已读取 `README.md`\n- 当前内容可正常访问\n\n这是 KoWork 测试运行时生成的**流式回复**。'
      )
    const chatContentBox = await page.locator('[data-chat-content]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const paddingLeft = Number.parseFloat(style.paddingLeft)
      const paddingRight = Number.parseFloat(style.paddingRight)
      return {
        x: bounds.x + paddingLeft,
        width: bounds.width - paddingLeft - paddingRight
      }
    })
    const composerBox = await page.locator('[data-chat-composer]').boundingBox()
    const chatScrollBox = await page.locator('[data-chat-scroll]').boundingBox()
    expect(composerBox).not.toBeNull()
    expect(chatScrollBox).not.toBeNull()
    expect(Math.abs(chatContentBox.x - composerBox!.x)).toBeLessThanOrEqual(1)
    expect(
      Math.abs(chatContentBox.x + chatContentBox.width - (composerBox!.x + composerBox!.width))
    ).toBeLessThanOrEqual(1)
    expect(chatScrollBox!.y + chatScrollBox!.height).toBeGreaterThan(
      composerBox!.y + composerBox!.height
    )
    expect(
      Math.abs(
        chatScrollBox!.y + chatScrollBox!.height - (composerBox!.y + composerBox!.height) - 10
      )
    ).toBeLessThanOrEqual(1)
    const composerOverlayBox = await page.locator('[data-chat-composer-overlay]').boundingBox()
    const composerOcclusionBox = await page.locator('[data-chat-composer-occlusion]').boundingBox()
    expect(composerOverlayBox).not.toBeNull()
    expect(composerOcclusionBox).not.toBeNull()
    expect(Math.abs(composerOverlayBox!.y - composerBox!.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(composerOcclusionBox!.y - (composerBox!.y + 16))).toBeLessThanOrEqual(1)
    await expect(page.locator('[data-chat-composer]')).toHaveCSS('border-radius', '16px')
    await expect(page.locator('[data-chat-composer]')).toHaveCSS(
      'transition-property',
      'border-color, box-shadow'
    )
    await expect(page.locator('[data-chat-composer]')).toHaveCSS('transition-duration', '0.2s')
    await expect(page.locator('[data-chat-composer-occlusion]')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    )
    const modelSelectorBox = await page.locator('[data-model-selector]').boundingBox()
    const permissionSelectorBox = await page.locator('[data-permission-selector]').boundingBox()
    expect(modelSelectorBox).not.toBeNull()
    expect(permissionSelectorBox).not.toBeNull()
    expect(Math.abs(modelSelectorBox!.height - permissionSelectorBox!.height)).toBeLessThanOrEqual(
      1
    )
    const sendButtonBox = await page.getByRole('button', { name: '发送' }).boundingBox()
    const sendButtonRadius = await page
      .getByRole('button', { name: '发送' })
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).borderRadius))
    expect(sendButtonBox).not.toBeNull()
    expect(sendButtonBox!.width).toBe(sendButtonBox!.height)
    expect(sendButtonRadius).toBeGreaterThanOrEqual(sendButtonBox!.width / 2)
    await page.screenshot({ path: testInfo.outputPath('conversation.png') })

    await statusInformation.getByRole('button', { name: /变更/ }).click()
    await expect(page.getByRole('tab', { name: '改动' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'README.md M', exact: true }).click()
    await expect(page.getByText(/diff --git a\/README\.md b\/README\.md/)).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('desktop.png') })

    await page.getByRole('button', { name: '返回上级' }).click()
    await page.getByPlaceholder('给 KoWork 发消息…').fill(`后台运行校验 ${'x'.repeat(2_000)}`)
    await page.getByRole('button', { name: '发送' }).click()
    const cancelButton = page.getByRole('button', { name: '取消运行' })
    await expect(cancelButton).toBeVisible()
    const cancelButtonBox = await cancelButton.boundingBox()
    const cancelButtonRadius = await cancelButton.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderRadius)
    )
    expect(cancelButtonBox).not.toBeNull()
    expect(cancelButtonBox!.width).toBe(cancelButtonBox!.height)
    expect(cancelButtonRadius).toBeGreaterThanOrEqual(cancelButtonBox!.width / 2)
    await expect
      .poll(() =>
        page
          .locator('[data-chat-scroll]')
          .evaluate((element) =>
            Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
          )
      )
      .toBeLessThanOrEqual(2)

    const reopenedWindow = electronApp.waitForEvent('window')
    await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
    await electronApp.evaluate(({ app }) => app.emit('activate'))
    page = await reopenedWindow
    await page.waitForLoadState('domcontentloaded')
    const restored = await page.evaluate(async () => {
      const api = Reflect.get(window, 'kowork') as KoWorkApi
      const bootstrap = await api.bootstrap()
      const threads = await api.threads.list(bootstrap.projects[0]!.id)
      const events = await api.events.list(threads[0]!.id)
      return { count: events.length, types: events.map((event) => event.type) }
    })
    expect(restored.count).toBeGreaterThan(0)
    expect(restored.types).toContain('run.started')
    await expect(page.getByText(/^后台运行校验/)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: '复制最终回复' })).toHaveCount(2, {
      timeout: 10_000
    })
    await expect(page.getByText('已完成')).toHaveCount(0)

    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1_000, 700)
    )
    await expect(page.getByRole('tab', { name: '概览' })).toBeHidden()
    await expect(page.getByPlaceholder('给 KoWork 发消息…')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('narrow.png') })
  } finally {
    await electronApp.close()
  }
})

test('stores provider credentials securely and restores them after restart', async () => {
  const testInfo = test.info()
  const dataPath = await mkdtemp(join(tmpdir(), 'kowork-credentials-e2e-'))
  const environment = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value ? [[key, value]] : []))
  )
  delete environment.ELECTRON_RUN_AS_NODE
  const packagedExecutable = process.env.KOWORK_E2E_EXECUTABLE
  const launch = (): Promise<ElectronApplication> =>
    electron.launch({
      ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
      args: packagedExecutable
        ? [`--user-data-dir=${dataPath}`]
        : [resolve('.'), `--user-data-dir=${dataPath}`],
      env: { ...environment, KOWORK_FAKE_AGENT: '1' }
    })
  const secret = 'e2e-provider-secret-value'
  let electronApp = await launch()

  try {
    let page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: '设置' }).first().click()
    await page.getByRole('button', { name: '模型' }).click()
    await page.getByRole('tab', { name: '接入' }).click()
    await page.getByRole('button', { name: '添加自定义提供商' }).click()
    await page.getByLabel('提供商').selectOption('anthropic-compatible')
    await page.getByLabel('名称').fill('E2E Anthropic Compatible')
    await page.getByLabel('API Key', { exact: true }).fill(secret)
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('E2E Anthropic Compatible').first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('providers.png') })
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1_000, 700)
    )
    await expect(page.getByRole('button', { name: '刷新模型' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('providers-narrow.png') })

    const bootstrap = await page.evaluate(async () => {
      const api = Reflect.get(window, 'kowork') as KoWorkApi
      return await api.bootstrap()
    })
    const provider = bootstrap.providers.find((item) => item.name === 'E2E Anthropic Compatible')
    expect(provider).toMatchObject({
      kind: 'custom',
      protocol: 'anthropic',
      credentialConfigured: true,
      available: true,
      builtin: false
    })
    expect(JSON.stringify(bootstrap)).not.toContain(secret)

    await electronApp.close()
    const encryptedFile = await readFile(join(dataPath, 'credentials.json'), 'utf8')
    const sqliteFile = await readFile(join(dataPath, 'kowork.sqlite'))
    expect(encryptedFile).not.toContain(secret)
    expect(sqliteFile.includes(Buffer.from(secret))).toBe(false)

    electronApp = await launch()
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const restored = await page.evaluate(async () => {
      const api = Reflect.get(window, 'kowork') as KoWorkApi
      const bootstrapAfterRestart = await api.bootstrap()
      return bootstrapAfterRestart.providers.find(
        (item) => item.name === 'E2E Anthropic Compatible'
      )
    })
    expect(restored).toMatchObject({ credentialConfigured: true, available: true })
  } finally {
    await electronApp.close().catch(() => undefined)
  }
})
