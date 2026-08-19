import { mkdir, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { ClientSettingsApi } from '@kowork/client-settings'
import { CoreApplication } from '@kowork/core'

function launchEnvironment(extra: Record<string, string> = {}): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value ? [[key, value]] : []))
  )
  delete environment.ELECTRON_RUN_AS_NODE
  return { ...environment, KOWORK_FAKE_AGENT: '1', ...extra }
}

function launch(
  dataPath: string,
  extraEnvironment: Record<string, string> = {}
): Promise<ElectronApplication> {
  const packagedExecutable = process.env.KOWORK_E2E_EXECUTABLE
  return electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: packagedExecutable
      ? [`--user-data-dir=${dataPath}`]
      : [resolve('.'), `--user-data-dir=${dataPath}`],
    env: launchEnvironment(extraEnvironment)
  })
}

test('applies and persists theme, wallpaper and chrome layering', async () => {
  const dataPath = await mkdtemp(join(tmpdir(), 'kowork-appearance-e2e-'))
  const wallpaperPath = join(dataPath, 'wallpaper.png')
  const projectPath = join(dataPath, 'fixture-project')
  await mkdir(projectPath)
  const seed = new CoreApplication(dataPath, undefined, true)
  const project = await seed.handle('projects.add', { rootPath: projectPath })
  await seed.handle('threads.create', { projectId: project.id, title: '外观测试' })
  await seed.close()
  await writeFile(
    wallpaperPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nZsAAAAASUVORK5CYII=',
      'base64'
    )
  )
  let electronApp = await launch(dataPath, { KOWORK_E2E_BACKGROUND_PATH: wallpaperPath })
  try {
    let page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'light')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'default')
    await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'off')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sidebar = document.querySelector('[data-sidebar]')
          const titlebar = document.querySelector('.kw-titlebar-blur')
          return Boolean(
            sidebar &&
            titlebar &&
            getComputedStyle(sidebar).backgroundColor === getComputedStyle(titlebar).backgroundColor
          )
        })
      )
      .toBe(true)

    await page.getByRole('button', { name: '设置' }).first().click()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await page.getByRole('button', { name: '跟随系统' }).click()
    await expect
      .poll(() => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
      .toBe('system')
    await page.getByRole('button', { name: '暗色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark')
    await expect(page.locator('.kw-theme-transition')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '外观' })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sidebar = document.querySelector('[data-sidebar]')
          const titlebar = document.querySelector('.kw-titlebar-blur')
          return Boolean(
            sidebar &&
            titlebar &&
            getComputedStyle(sidebar).backgroundColor === getComputedStyle(titlebar).backgroundColor
          )
        })
      )
      .toBe(true)
    await page.getByLabel('自定义强调色').fill('#ffffff')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'custom')
    await expect(page.locator('.kw-theme-transition')).toHaveCount(0)
    await page.getByRole('button', { name: '紫色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet')
    await expect(page.locator('.kw-theme-transition')).toHaveCount(0)
    await page.getByRole('button', { name: '选择图片' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'on')
    await expect(page.locator('.kw-wallpaper-layer__image')).toBeVisible()

    const sliders = page.getByRole('slider')
    for (const value of ['12', '44', '16']) await sliders.nth(0).fill(value)
    for (const value of ['0.58', '0.83', '0.65']) await sliders.nth(1).fill(value)
    await expect(page.locator('html')).toHaveCSS('--kw-wallpaper-blur', '16px')
    await expect(page.locator('html')).toHaveCSS('--kw-chrome-opacity', '65%')
    await expect
      .poll(async () => {
        const persisted = JSON.parse(await readFile(join(dataPath, 'client-settings.json'), 'utf8'))
        return {
          blurPx: persisted.appearance.background?.blurPx,
          surfaceOpacity: persisted.appearance.background?.surfaceOpacity
        }
      })
      .toEqual({ blurPx: 16, surfaceOpacity: 0.65 })
    await expect(sliders.nth(0)).toHaveValue('16')
    await expect(sliders.nth(1)).toHaveValue('0.65')
    await expect(page.locator('[data-chat-composer-occlusion]')).toHaveCount(0)
    await expect(page.locator('[data-chat-composer]')).toHaveCSS(
      'background-color',
      'rgb(48, 48, 48)'
    )
    await expect(page.locator('[data-settings-dialog] .kw-surface-dialog')).toHaveCSS(
      'background-color',
      'rgb(48, 48, 48)'
    )
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.locator('[data-inspector-titlebar]')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const workspace = document.querySelector('[data-workspace-titlebar]')
          const inspector = document.querySelector('[data-inspector-titlebar]')
          if (!workspace || !inspector) return false
          const workspaceStyle = getComputedStyle(workspace)
          const inspectorStyle = getComputedStyle(inspector)
          return (
            workspaceStyle.backgroundColor === inspectorStyle.backgroundColor &&
            workspaceStyle.backdropFilter === inspectorStyle.backdropFilter
          )
        })
      )
      .toBe(true)
    expect(await page.locator('.kw-chrome .kw-chrome').count()).toBe(0)
    const wallpaperBounds = await page.locator('.kw-wallpaper-layer__image').boundingBox()
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    expect(wallpaperBounds).not.toBeNull()
    expect(wallpaperBounds!.x).toBeLessThanOrEqual(0)
    expect(wallpaperBounds!.y).toBeLessThanOrEqual(0)
    expect(wallpaperBounds!.x + wallpaperBounds!.width).toBeGreaterThanOrEqual(viewport.width)
    expect(wallpaperBounds!.y + wallpaperBounds!.height).toBeGreaterThanOrEqual(viewport.height)

    await electronApp.close()
    electronApp = await launch(dataPath, { KOWORK_E2E_BACKGROUND_PATH: wallpaperPath })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet')
    await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'on')
    const persisted = JSON.parse(await readFile(join(dataPath, 'client-settings.json'), 'utf8'))
    expect(persisted).toMatchObject({
      appearance: {
        colorScheme: 'dark',
        accent: { type: 'preset', id: 'violet' },
        background: { blurPx: 16, surfaceOpacity: 0.65 }
      }
    })
    const persistedAssetId = persisted.appearance.background.assetId as string

    await electronApp.close()
    await unlink(join(dataPath, 'backgrounds', persistedAssetId))
    electronApp = await launch(dataPath, { KOWORK_E2E_BACKGROUND_PATH: wallpaperPath })
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark')
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet')
    await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'off')
    const cleared = JSON.parse(await readFile(join(dataPath, 'client-settings.json'), 'utf8'))
    expect(cleared).toMatchObject({
      appearance: {
        colorScheme: 'dark',
        accent: { type: 'preset', id: 'violet' },
        background: null
      }
    })
  } finally {
    await electronApp.close().catch(() => undefined)
  }
})

test('migrates legacy localStorage widths once and removes the old keys', async () => {
  const dataPath = await mkdtemp(join(tmpdir(), 'kowork-layout-migration-e2e-'))
  let electronApp = await launch(dataPath)
  try {
    let page = await electronApp.firstWindow()
    await page.evaluate(() => {
      localStorage.setItem('kowork:left-sidebar-width', '300')
      localStorage.setItem('kowork:right-sidebar-width', 'invalid')
      localStorage.setItem('kowork:settings-provider-list-width', '240')
    })
    await electronApp.close()
    await writeFile(
      join(dataPath, 'client-settings.json'),
      JSON.stringify({
        version: 1,
        appearance: {
          colorScheme: 'light',
          accent: { type: 'preset', id: 'blue' },
          background: null
        },
        layout: {},
        locale: 'zh-CN'
      })
    )

    electronApp = await launch(dataPath)
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const state = await page.evaluate(async () => {
      const api = (window.kowork as typeof window.kowork & { clientSettings: ClientSettingsApi })
        .clientSettings
      return {
        settings: await api.get(),
        legacy: {
          left: localStorage.getItem('kowork:left-sidebar-width'),
          right: localStorage.getItem('kowork:right-sidebar-width'),
          provider: localStorage.getItem('kowork:settings-provider-list-width')
        }
      }
    })
    expect(state.settings).toMatchObject({
      status: 'ready',
      snapshot: {
        layout: {
          leftSidebarWidth: 300,
          rightSidebarWidth: 332,
          settingsProviderListWidth: 240
        }
      },
      warnings: [
        {
          code: 'LEGACY_LAYOUT_INVALID',
          key: 'rightSidebarWidth',
          reason: 'invalid',
          defaultValue: 332
        }
      ]
    })
    expect(state.legacy).toEqual({ left: null, right: null, provider: null })
    expect(
      JSON.parse(await readFile(join(dataPath, 'client-settings.json'), 'utf8'))
    ).toMatchObject({
      layout: {
        leftSidebarWidth: 300,
        rightSidebarWidth: 332,
        settingsProviderListWidth: 240
      }
    })
  } finally {
    await electronApp.close().catch(() => undefined)
  }
})

test('shows damaged settings and resets the complete client snapshot', async () => {
  const dataPath = await mkdtemp(join(tmpdir(), 'kowork-appearance-invalid-e2e-'))
  const settingsPath = join(dataPath, 'client-settings.json')
  await writeFile(settingsPath, '{ damaged')
  const electronApp = await launch(dataPath)
  try {
    const page = await electronApp.firstWindow()
    await expect(page.getByRole('heading', { name: '外观设置无法读取' })).toBeVisible()
    await page.getByRole('button', { name: '重置全部外观设置' }).click()
    await expect(page.getByText('KoWork')).toBeVisible()
    const apiState = await page.evaluate(async () => {
      const api = (window.kowork as typeof window.kowork & { clientSettings: ClientSettingsApi })
        .clientSettings
      return await api.get()
    })
    expect(apiState).toMatchObject({ status: 'ready', snapshot: { version: 1 } })
  } finally {
    await electronApp.close()
  }
})
