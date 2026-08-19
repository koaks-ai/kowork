import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PanelRightClose, PanelRightOpen, Pencil, Play } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  threadSchema,
  type AppBootstrapDto,
  type RunEventDto,
  type ThreadDto
} from '@kowork/contracts'
import { Button, IconButton, Reveal, SwapText } from '@kowork/design-system'
import { Composer } from '../features/chat/Composer'
import { Timeline } from '../features/chat/Timeline'
import { useWorkbenchStore } from '../shared/store/workbench'
import { InlineRenameInput } from '../shared/ui/InlineRenameInput'

const AUTO_SCROLL_THRESHOLD_PX = 80

function mergeEvents(...groups: RunEventDto[][]): RunEventDto[] {
  const byId = new Map<string, RunEventDto>()
  for (const event of groups.flat()) byId.set(event.id, event)
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence)
}

export function ConversationWorkspace({
  bootstrap,
  inspectorOpen = false,
  frosted = false,
  onInspectorToggle
}: {
  bootstrap: AppBootstrapDto
  inspectorOpen?: boolean
  frosted?: boolean
  onInspectorToggle?(): void
}): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [composerHeight, setComposerHeight] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
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
  const renameThread = useMutation({
    mutationFn: (title: string) => window.kowork.threads.update(thread!.id, { title }),
    onSuccess: (updated) =>
      queryClient.setQueryData<ThreadDto[]>(['threads', updated.projectId], (current = []) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
  })

  useEffect(() => {
    setEditingTitle(false)
  }, [threadId])

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
      <main data-frosted={frosted || undefined} className="kw-chrome flex min-w-0 flex-1 items-center justify-center text-sm text-kw-text-muted">
        {project ? t('noThread') : t('noProject')}
      </main>
    )
  }

  const hasConversation = eventsQuery.data?.some((event) => event.type === 'run.started') ?? false
  return (
    <main data-frosted={frosted || undefined} className="kw-chrome relative flex min-w-0 flex-1 flex-col">
      <header
        data-workspace-titlebar
        className="app-drag kw-titlebar-blur absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between border-b border-kw-border-default px-4"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {editingTitle ? (
            <InlineRenameInput
              value={thread.title}
              placeholder={t('untitledThread')}
              aria-label={t('threadTitle')}
              className="no-drag h-8 min-w-[10rem] max-w-md rounded-md border border-kw-border-strong bg-kw-surface px-2 text-sm font-medium text-kw-text-primary outline-none focus-visible:border-kw-accent"
              onSubmit={(title) => {
                setEditingTitle(false)
                renameThread.mutate(title)
              }}
              onCancel={() => setEditingTitle(false)}
            />
          ) : (
            <>
              <SwapText
                value={thread.title}
                fallback={t('untitledThread')}
                className="min-w-0 truncate font-medium text-kw-text-primary"
              />
              <IconButton label={t('renameThread')} onClick={() => setEditingTitle(true)}>
                <Pencil size={13} />
              </IconButton>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {thread.queuePaused && (
            <Button
              className="no-drag h-8 border-kw-warning bg-kw-warning-subtle text-kw-warning"
              onClick={() => resumeQueue.mutate()}
            >
              <Play size={13} />
              {t('resumeQueue')}
            </Button>
          )}
          {onInspectorToggle ? (
            <IconButton
              label={inspectorOpen ? t('hideInspector') : t('showInspector')}
              active={inspectorOpen}
              onClick={onInspectorToggle}
            >
              {inspectorOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
            </IconButton>
          ) : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollContainer}
          data-chat-scroll
          className="flex h-full flex-col overflow-y-scroll"
          style={{ '--kowork-composer-height': `${composerHeight}px` } as CSSProperties}
          onScroll={(event) => {
            const container = event.currentTarget
            const distanceFromBottom =
              container.scrollHeight - container.scrollTop - container.clientHeight
            followingLatest.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX
          }}
        >
          <Reveal contentKey={threadId} className="flex min-h-full flex-1 flex-col">
            <div className="flex flex-1 flex-col pt-12" style={{ paddingBottom: composerHeight }}>
              {hasConversation ? (
                <Timeline events={eventsQuery.data ?? []} />
              ) : (
                <div className="flex flex-1 items-center justify-center px-6">
                  <p className="text-sm text-kw-text-muted">{t('emptyConversation')}</p>
                </div>
              )}
            </div>
          </Reveal>
        </div>
        <Composer
          thread={thread}
          providers={bootstrap.providers}
          profiles={bootstrap.modelProfiles}
          activeRun={activeRun}
          queuedCount={(queueQuery.data ?? []).filter((item) => item.status === 'queued').length}
          onHeightChange={setComposerHeight}
        />
      </div>
    </main>
  )
}
