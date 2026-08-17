// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppBootstrapDto, KoWorkApi, ProjectDto, ThreadDto } from '@kowork/contracts'
import { useWorkbenchStore } from '../../src/renderer/src/shared/store/workbench'
import '../../src/renderer/src/shared/i18n'
import { ProjectSidebar } from '../../src/renderer/src/widgets/ProjectSidebar'

declare global {
  interface Window {
    kowork: KoWorkApi
  }
}

const now = Date.now()
const projects: ProjectDto[] = [
  {
    id: 'project-a',
    name: 'Alpha',
    rootPath: '/projects/alpha',
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  },
  {
    id: 'project-b',
    name: 'Beta',
    rootPath: '/projects/beta',
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
]
const threads: Record<string, ThreadDto[]> = Object.fromEntries(
  projects.map((project) => [
    project.id,
    [
      {
        id: `thread-${project.id}`,
        projectId: project.id,
        title: `${project.name} conversation`,
        modelProfileId: 'model',
        permissionMode: 'ask',
        contextWindowTokens: null,
        queuePaused: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null
      }
    ]
  ])
)
const bootstrap: AppBootstrapDto = {
  projects,
  providers: [],
  modelProfiles: [],
  settings: { defaultModelProfileId: null, defaultPermissionMode: 'ask' },
  activeRuns: [],
  pendingApprovals: [],
  lastEventSequence: 0
}

afterEach(() => {
  cleanup()
  useWorkbenchStore.setState({ projectId: undefined, threadId: undefined })
  vi.restoreAllMocks()
})

function installApi(): {
  list: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  archive: ReturnType<typeof vi.fn>
} {
  const list = vi.fn((projectId: string) => Promise.resolve(threads[projectId] ?? []))
  const update = vi.fn(async (threadId: string, changes: Partial<ThreadDto>) => {
    const thread = Object.values(threads)
      .flat()
      .find((item) => item.id === threadId)!
    return { ...thread, ...changes, updatedAt: Date.now() }
  })
  const archive = vi.fn(async (threadId: string) => {
    const thread = Object.values(threads)
      .flat()
      .find((item) => item.id === threadId)!
    return { ...thread, deletedAt: Date.now() }
  })
  Object.defineProperty(window, 'kowork', {
    configurable: true,
    value: { threads: { list, update, archive } } as unknown as KoWorkApi
  })
  return { list, update, archive }
}

function renderSidebar(): { view: ReturnType<typeof render>; queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const view = render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        Tooltip.Provider,
        null,
        createElement(ProjectSidebar, { bootstrap, isMacOS: false })
      )
    )
  )
  return { view, queryClient }
}

describe('ProjectSidebar', () => {
  it('keeps multiple projects expanded independently', async () => {
    useWorkbenchStore.setState({ projectId: 'project-a', threadId: 'thread-project-a' })
    installApi()
    const { view, queryClient } = renderSidebar()
    const alpha = view.getByRole('button', { name: 'Alpha' })
    const beta = view.getByRole('button', { name: 'Beta' })

    expect(alpha.getAttribute('aria-expanded')).toBe('true')
    expect(beta.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(view.getByText('Alpha conversation')).not.toBeNull())
    const alphaThread = threads['project-a']![0]!
    act(() => {
      queryClient.setQueryData<ThreadDto[]>(
        ['threads', 'project-a'],
        [
          alphaThread,
          { ...alphaThread, id: 'thread-project-a-follow-up', title: 'Alpha follow-up' }
        ]
      )
    })
    await waitFor(() => expect(view.getByText('Alpha follow-up')).not.toBeNull())
    const alphaDisclosure = view.container.querySelector('#project-threads-project-a')!
    const highlight = alphaDisclosure.querySelector(
      '[data-selection-highlight]'
    ) as HTMLElement
    expect(highlight.style.transform).toBe('translateY(0px)')

    fireEvent.click(view.getByRole('button', { name: 'Alpha follow-up' }))
    await waitFor(() => expect(highlight.style.transform).toBe('translateY(34px)'))
    fireEvent.click(view.getByRole('button', { name: 'Alpha conversation' }))

    fireEvent.click(beta)

    await waitFor(() => expect(view.getByText('Beta conversation')).not.toBeNull())
    expect(alpha.getAttribute('aria-expanded')).toBe('true')
    expect(beta.getAttribute('aria-expanded')).toBe('true')
    expect(useWorkbenchStore.getState()).toMatchObject({
      projectId: 'project-a',
      threadId: 'thread-project-a'
    })

    fireEvent.click(view.getByRole('button', { name: 'Beta conversation' }))
    expect(useWorkbenchStore.getState()).toMatchObject({
      projectId: 'project-b',
      threadId: 'thread-project-b'
    })

    fireEvent.click(alpha)
    expect(alpha.getAttribute('aria-expanded')).toBe('false')
    expect(beta.getAttribute('aria-expanded')).toBe('true')
  })

  it('renames a thread from the context menu', async () => {
    useWorkbenchStore.setState({ projectId: 'project-a', threadId: 'thread-project-a' })
    const api = installApi()
    const { view } = renderSidebar()
    await waitFor(() => expect(view.getByText('Alpha conversation')).not.toBeNull())

    fireEvent.contextMenu(view.getByRole('button', { name: 'Alpha conversation' }))
    fireEvent.click(view.getByRole('menuitem', { name: '修改名称' }))

    const input = view.getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
    expect(input.value).toBe('Alpha conversation')
    fireEvent.change(input, { target: { value: '  手动命名的会话  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('thread-project-a', { title: '手动命名的会话' })
    )
    await waitFor(() => expect(view.getByText('手动命名的会话')).not.toBeNull())
  })

  it('archives a thread from the context menu and clears the selection', async () => {
    useWorkbenchStore.setState({ projectId: 'project-a', threadId: 'thread-project-a' })
    const api = installApi()
    const { view } = renderSidebar()
    await waitFor(() => expect(view.getByText('Alpha conversation')).not.toBeNull())

    fireEvent.contextMenu(view.getByRole('button', { name: 'Alpha conversation' }))
    const items = view.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['修改名称', '删除会话'])
    fireEvent.click(view.getByRole('menuitem', { name: '删除会话' }))

    await waitFor(() => expect(api.archive).toHaveBeenCalledWith('thread-project-a'))
    await waitFor(() => expect(view.queryByText('Alpha conversation')).toBeNull())
    expect(useWorkbenchStore.getState().threadId).toBeUndefined()
  })
})
