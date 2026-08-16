import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Pencil, Play } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  threadSchema,
  type AppBootstrapDto,
  type RunEventDto,
  type ThreadDto
} from '@kowork/contracts'
import { Composer } from '../features/chat/Composer'
import { Timeline } from '../features/chat/Timeline'
import { useWorkbenchStore } from '../shared/store/workbench'
import { BlurSwapText } from '../shared/ui/BlurSwapText'
import { BlurReveal } from '../shared/ui/BlurReveal'
import { IconButton } from '../shared/ui/IconButton'

const suggestions = [
  'suggestionArchitecture',
  'suggestionGit',
  'suggestionLoop',
  'suggestionBug'
] as const

const AUTO_SCROLL_THRESHOLD_PX = 80

function mergeEvents(...groups: RunEventDto[][]): RunEventDto[] {
  const byId = new Map<string, RunEventDto>()
  for (const event of groups.flat()) byId.set(event.id, event)
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence)
}

export function ConversationWorkspace({
  bootstrap
}: {
  bootstrap: AppBootstrapDto
}): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [composerHeight, setComposerHeight] = useState(0)
  const { projectId, threadId } = useWorkbenchStore()
  const scrollContainer = useRef<HTMLDivElement>(null)
  const followingLatest = useRef(true)

  const threadsQuery = useQuery({
    queryKey: ['threads', projectId],
    queryFn: () => window.kowork.threads.list(projectId!),
    enabled: Boolean(projectId)
  })
  const thread = threadsQuery.data?.find((item) => item.id === threadId)
  const project = bootstrap.projects.find((item) => item.id === projectId)
  const eventsKey = ['events', threadId] as const
  const eventsQuery = useQuery({
    queryKey: eventsKey,
    queryFn: async () => {
      const history = await window.kowork.events.list(threadId)
      const live = queryClient.getQueryData<RunEventDto[]>(eventsKey) ?? []
      return mergeEvents(history, live)
    },
    enabled: Boolean(threadId),
    staleTime: 0,
    refetchOnMount: 'always'
  })
  const runsQuery = useQuery({
    queryKey: ['runs', threadId],
    queryFn: () => window.kowork.runs.list(threadId!),
    enabled: Boolean(threadId)
  })
  const queueQuery = useQuery({
    queryKey: ['queue', threadId],
    queryFn: () => window.kowork.runs.queue(threadId!),
    enabled: Boolean(threadId)
  })
  const activeRun = runsQuery.data?.find((run) =>
    ['starting', 'running', 'waiting'].includes(run.status)
  )
  const resumeQueue = useMutation({
    mutationFn: () => window.kowork.runs.resumeQueue(thread!.id),
    onSuccess: (updated) =>
      queryClient.setQueryData<ThreadDto[]>(['threads', updated.projectId], (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
  })

  useEffect(
    () =>
      window.kowork.events.subscribe((event) => {
        if (event.threadId) {
          if (event.type === 'thread.updated') {
            const parsed = threadSchema.safeParse(event.payload.thread)
            if (parsed.success) {
              queryClient.setQueryData<ThreadDto[]>(
                ['threads', parsed.data.projectId],
                (current = []) =>
                  current.map((item) => (item.id === parsed.data.id ? parsed.data : item))
              )
            }
          }
          const key = ['events', event.threadId] as const
          if (queryClient.getQueryState(key)) {
            queryClient.setQueryData<RunEventDto[]>(key, (current = []) =>
              mergeEvents(current, [event])
            )
          }
          if (
            [
              'run.started',
              'run.completed',
              'run.failed',
              'run.cancelled',
              'run.interrupted',
              'run.waiting'
            ].includes(event.type)
          ) {
            void queryClient.invalidateQueries({ queryKey: ['runs', event.threadId] })
            void queryClient.invalidateQueries({ queryKey: ['queue', event.threadId] })
          }
          if (event.type.startsWith('approval.'))
            void queryClient.invalidateQueries({ queryKey: ['approvals', event.threadId] })
        }
      }),
    [queryClient]
  )

  useLayoutEffect(() => {
    followingLatest.current = true
  }, [threadId])

  useLayoutEffect(() => {
    const container = scrollContainer.current
    if (!container || !followingLatest.current) return

    const frame = requestAnimationFrame(() => {
      if (followingLatest.current) container.scrollTop = container.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [composerHeight, eventsQuery.data, threadId])

  useLayoutEffect(() => {
    const container = scrollContainer.current
    const content = container?.firstElementChild
    if (!container || !content || typeof ResizeObserver === 'undefined') return

    let frame: number | undefined
    const observer = new ResizeObserver(() => {
      if (!followingLatest.current) return
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (followingLatest.current) container.scrollTop = container.scrollHeight
      })
    })
    observer.observe(content)

    return () => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [threadId])

  if (!project || !thread) {
    return (
      <main className="flex min-w-0 flex-1 items-center justify-center bg-white text-sm text-neutral-500">
        {project ? t('noThread') : t('noProject')}
      </main>
    )
  }

  const hasConversation = eventsQuery.data?.some((event) => event.type === 'run.started') ?? false
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="app-drag flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <BlurSwapText
            value={thread.title}
            fallback={t('untitledThread')}
            className="min-w-0 truncate font-medium text-neutral-900"
          />
          <IconButton label={t('threadTitle')}>
            <Pencil size={13} />
          </IconButton>
        </div>
        {thread.queuePaused && (
          <button
            className="no-drag flex h-8 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100"
            onClick={() => resumeQueue.mutate()}
          >
            <Play size={13} />
            {t('resumeQueue')}
          </button>
        )}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollContainer}
          data-chat-scroll
          className="h-full overflow-y-scroll"
          onScroll={(event) => {
            const container = event.currentTarget
            const distanceFromBottom =
              container.scrollHeight - container.scrollTop - container.clientHeight
            followingLatest.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX
          }}
        >
          <BlurReveal contentKey={threadId} className="min-h-full">
            <div style={{ paddingBottom: composerHeight }}>
              {hasConversation ? (
                <Timeline events={eventsQuery.data ?? []} />
              ) : (
                <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-12">
                  <div className="mb-5 grid size-12 place-items-center rounded-lg bg-blue-600 text-white">
                    <Bot size={24} />
                  </div>
                  <h1 className="text-2xl font-semibold text-neutral-900">{t('codingAgent')}</h1>
                  <p className="mt-2 text-sm text-neutral-500">{t('emptyConversation')}</p>
                  <div className="mt-8 grid w-full grid-cols-2 gap-3">
                    {suggestions.map((key) => (
                      <button
                        key={key}
                        className="rounded-lg border border-neutral-200 bg-white p-4 text-left text-sm text-neutral-700 hover:border-blue-400 hover:text-blue-700"
                        onClick={() => window.kowork.runs.enqueue(thread.id, t(key))}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </BlurReveal>
        </div>
        <Composer
          thread={thread}
          profiles={bootstrap.modelProfiles}
          activeRun={activeRun}
          queuedCount={(queueQuery.data ?? []).filter((item) => item.status === 'queued').length}
          onHeightChange={setComposerHeight}
        />
      </div>
    </main>
  )
}
