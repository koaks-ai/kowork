// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AppBootstrapDto,
  KoWorkApi,
  ModelProfileDto,
  ProjectDto,
  ProviderDto,
  ThreadDto
} from '@kowork/contracts'
import { useWorkbenchStore } from '../../src/renderer/src/shared/store/workbench'
import '../../src/renderer/src/shared/i18n'
import { ConversationWorkspace } from '../../src/renderer/src/widgets/ConversationWorkspace'

declare global {
  interface Window {
    kowork: KoWorkApi
  }
}

const now = Date.now()
const project: ProjectDto = {
  id: 'project-a',
  name: 'Alpha',
  rootPath: '/projects/alpha',
  createdAt: now,
  updatedAt: now,
  deletedAt: null
}
const thread: ThreadDto = {
  id: 'thread-a',
  projectId: project.id,
  title: '生成的标题',
  modelProfileId: 'model',
  permissionMode: 'ask',
  contextWindowTokens: null,
  queuePaused: false,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
}
const provider: ProviderDto = {
  id: 'provider-a',
  name: 'Provider A',
  kind: 'openai',
  protocol: 'openai-chat',
  baseUrl: 'https://example.com',
  credentialConfigured: true,
  enabled: true,
  available: true,
  builtin: false,
  defaultContextWindowTokens: 128_000,
  createdAt: now,
  updatedAt: now
}
const modelProfiles: ModelProfileDto[] = [
  {
    id: 'model',
    providerId: provider.id,
    name: 'Model One',
    model: 'model-one',
    contextWindowTokens: 128_000,
    source: 'manual',
    enabled: true,
    available: true,
    createdAt: now,
    updatedAt: now
  },
  {
    id: 'model-two',
    providerId: provider.id,
    name: 'Model Two',
    model: 'model-two',
    contextWindowTokens: 128_000,
    source: 'manual',
    enabled: true,
    available: true,
    createdAt: now,
    updatedAt: now
  }
]
const bootstrap: AppBootstrapDto = {
  projects: [project],
  providers: [provider],
  modelProfiles,
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

class ResizeObserverStub {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

describe('ConversationWorkspace', () => {
  it('renames the open thread from the header pencil', async () => {
    useWorkbenchStore.setState({ projectId: project.id, threadId: thread.id })
    const update = vi.fn(async (_threadId: string, changes: Partial<ThreadDto>) => ({
      ...thread,
      ...changes,
      updatedAt: Date.now()
    }))
    Object.defineProperty(window, 'kowork', {
      configurable: true,
      value: {
        threads: {
          list: async () => [thread],
          update
        },
        events: {
          list: async () => [],
          subscribe: () => () => undefined
        },
        runs: {
          list: async () => [],
          queue: async () => []
        },
        approvals: {
          list: async () => []
        }
      } as unknown as KoWorkApi
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    const view = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Tooltip.Provider, null, createElement(ConversationWorkspace, { bootstrap }))
      )
    )

    await waitFor(() => expect(view.getByText('生成的标题')).not.toBeNull())
    fireEvent.click(view.getByRole('button', { name: '修改名称' }))
    const input = view.getByRole('textbox', { name: '会话标题' }) as HTMLInputElement
    expect(input.value).toBe('生成的标题')
    fireEvent.change(input, { target: { value: '我的会话' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(update).toHaveBeenCalledWith('thread-a', { title: '我的会话' }))
    const swappedTitle = await waitFor(() => {
      const element = view.container.querySelector('.kw-swap-text-value[data-phase="out"]')
      expect(element).not.toBeNull()
      return element!
    })
    fireEvent(swappedTitle, new Event('animationend', { bubbles: true }))
    await waitFor(() => expect(view.getByText('我的会话')).not.toBeNull())
  })

  it('updates the thread model from the composer selector', async () => {
    useWorkbenchStore.setState({ projectId: project.id, threadId: thread.id })
    const update = vi.fn(async (_threadId: string, changes: Partial<ThreadDto>) => ({
      ...thread,
      ...changes,
      updatedAt: Date.now()
    }))
    Object.defineProperty(window, 'kowork', {
      configurable: true,
      value: {
        threads: {
          list: async () => [thread],
          update
        },
        events: {
          list: async () => [],
          subscribe: () => () => undefined
        },
        runs: {
          list: async () => [],
          queue: async () => []
        },
        approvals: {
          list: async () => []
        }
      } as unknown as KoWorkApi
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    })
    const view = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Tooltip.Provider, null, createElement(ConversationWorkspace, { bootstrap }))
      )
    )

    const selector = await view.findByRole('button', { name: /Model One/ })
    fireEvent.pointerDown(selector, { button: 0, ctrlKey: false })
    fireEvent.click(await view.findByRole('menuitem', { name: 'Model Two' }))

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('thread-a', { modelProfileId: 'model-two' })
    )
    await waitFor(() => expect(view.getByRole('button', { name: /Model Two/ })).not.toBeNull())
  })
})
