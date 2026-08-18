import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ChevronRight,
  Folder,
  FolderPlus,
  MessageSquarePlus,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppBootstrapDto,
  ProjectDto,
  RunDto,
  RunEventType,
  ThreadDto
} from '@kowork/contracts'
import {
  Button,
  ContextMenu,
  Disclosure,
  IconButton,
  OrbitSquares,
  SelectableItem,
  SelectableList,
  SwapText
} from '@kowork/design-system'
import { SettingsDialog } from '../features/settings/SettingsDialog'
import { useWorkbenchStore } from '../shared/store/workbench'
import { InlineRenameInput } from '../shared/ui/InlineRenameInput'

interface ProjectSidebarProps {
  bootstrap: AppBootstrapDto
  isMacOS: boolean
  frosted?: boolean
}

const EMPTY_THREADS: ThreadDto[] = []
const RUN_STARTED_EVENTS = new Set<RunEventType>(['run.started', 'run.waiting'])
const RUN_ENDED_EVENTS = new Set<RunEventType>([
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.interrupted'
])

function useRunningThreadIds(initialRuns: RunDto[]): Set<string> {
  const [ids, setIds] = useState(() => new Set(initialRuns.map((run) => run.threadId)))

  useEffect(() => {
    return window.kowork.events.subscribe((event) => {
      if (!event.threadId) return
      const threadId = event.threadId
      if (RUN_STARTED_EVENTS.has(event.type)) {
        setIds((current) => {
          if (current.has(threadId)) return current
          const next = new Set(current)
          next.add(threadId)
          return next
        })
        return
      }
      if (RUN_ENDED_EVENTS.has(event.type)) {
        setIds((current) => {
          if (!current.has(threadId)) return current
          const next = new Set(current)
          next.delete(threadId)
          return next
        })
      }
    })
  }, [])

  return ids
}

interface ProjectThreadListProps {
  threads: ThreadDto[]
  selectedThreadId?: string
  runningThreadIds: Set<string>
  onSelect(threadId: string): void
  onRename(threadId: string, title: string): void
  onArchive(threadId: string): void
}

function ThreadRunningMark({ running }: { running: boolean }): React.JSX.Element {
  return (
    <span className="flex w-[15px] shrink-0 items-center justify-center">
      {running ? <OrbitSquares /> : null}
    </span>
  )
}

function ProjectThreadList({
  threads,
  selectedThreadId,
  runningThreadIds,
  onSelect,
  onRename,
  onArchive
}: ProjectThreadListProps): React.JSX.Element {
  const { t } = useTranslation()
  const [renamingId, setRenamingId] = useState<string | null>(null)

  return (
    <SelectableList value={selectedThreadId} selectionStyle="sliding" className="flex flex-col gap-0.5">
      {threads.map((thread) => (
        <ContextMenu
          key={thread.id}
          onOpenChange={(open) => {
            if (open) setRenamingId(null)
          }}
        >
          <ContextMenu.Trigger asChild>
            <SelectableItem value={thread.id} asChild>
              <div
                className={`flex h-[34px] w-full items-center rounded-md px-2 ${thread.id === selectedThreadId ? 'text-kw-text-primary' : 'text-kw-text-secondary'}`}
              >
                {renamingId === thread.id ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ThreadRunningMark running={runningThreadIds.has(thread.id)} />
                    <InlineRenameInput
                      value={thread.title}
                      placeholder={t('untitledThread')}
                      aria-label={t('threadTitle')}
                      className="mx-0.5 h-[26px] min-w-0 flex-1 rounded-md border border-kw-accent bg-kw-surface px-2 text-sm text-kw-text-primary outline-none"
                      onSubmit={(title) => {
                        setRenamingId(null)
                        onRename(thread.id, title)
                      }}
                      onCancel={() => setRenamingId(null)}
                    />
                  </div>
                ) : (
                  <button
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => onSelect(thread.id)}
                  >
                    <ThreadRunningMark running={runningThreadIds.has(thread.id)} />
                    <SwapText
                      className="min-w-0 flex-1"
                      value={thread.title}
                      fallback={t('untitledThread')}
                    />
                  </button>
                )}
              </div>
            </SelectableItem>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>
              <ContextMenu.Item onSelect={() => setRenamingId(thread.id)}>
                <Pencil size={14} />
                {t('renameThread')}
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item destructive onSelect={() => onArchive(thread.id)}>
                <Trash2 size={14} />
                {t('deleteThread')}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu>
      ))}
    </SelectableList>
  )
}

export function ProjectSidebar({
  bootstrap,
  isMacOS,
  frosted = false
}: ProjectSidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { projectId, threadId, setProject, setThread } = useWorkbenchStore()
  const projects = bootstrap.projects
  const runningThreadIds = useRunningThreadIds(bootstrap.activeRuns)
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => {
    const initialProjectId = projectId ?? projects[0]?.id
    return initialProjectId ? new Set([initialProjectId]) : new Set()
  })
  const threadQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ['threads', project.id],
      queryFn: () => window.kowork.threads.list(project.id),
      enabled: expandedProjectIds.has(project.id)
    }))
  })
  const activeProjectIndex = projects.findIndex((project) => project.id === projectId)
  const activeThreads = threadQueries[activeProjectIndex]?.data ?? EMPTY_THREADS

  useEffect(() => {
    if (!projectId && projects[0]) setProject(projects[0].id)
  }, [projectId, projects, setProject])
  useEffect(() => {
    if (projectId && !threadId && activeThreads[0]) setThread(activeThreads[0].id)
  }, [activeThreads, projectId, setThread, threadId])

  const addProject = useMutation({
    mutationFn: () => window.kowork.projects.add(),
    onSuccess: (project) => {
      if (!project) return
      queryClient.setQueryData<ProjectDto[]>(['projects'], (current = []) => [
        project,
        ...current.filter((item) => item.id !== project.id)
      ])
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      setExpandedProjectIds((current) => new Set(current).add(project.id))
      setProject(project.id)
    }
  })
  const createThread = useMutation({
    mutationFn: (targetProjectId: string) => window.kowork.threads.create(targetProjectId),
    onSuccess: (thread) => {
      queryClient.setQueryData<ThreadDto[]>(['threads', thread.projectId], (current = []) => [
        thread,
        ...current
      ])
      setExpandedProjectIds((current) => new Set(current).add(thread.projectId))
      setProject(thread.projectId)
      setThread(thread.id)
    }
  })
  const renameThread = useMutation({
    mutationFn: ({ threadId: targetThreadId, title }: { threadId: string; title: string }) =>
      window.kowork.threads.update(targetThreadId, { title }),
    onSuccess: (thread) => {
      queryClient.setQueryData<ThreadDto[]>(['threads', thread.projectId], (current = []) =>
        current.map((item) => (item.id === thread.id ? thread : item))
      )
    }
  })
  const archiveThread = useMutation({
    mutationFn: (targetThreadId: string) => window.kowork.threads.archive(targetThreadId),
    onSuccess: (thread) => {
      queryClient.setQueryData<ThreadDto[]>(['threads', thread.projectId], (current = []) =>
        current.filter((item) => item.id !== thread.id)
      )
      if (useWorkbenchStore.getState().threadId === thread.id) setThread(undefined)
    }
  })

  return (
    <aside
      data-frosted={frosted || undefined}
      className="group/sidebar flex h-full w-full flex-col border-r border-kw-border-default bg-kw-surface data-[frosted]:bg-kw-surface-frosted"
    >
      <div
        className={`app-brand app-drag flex shrink-0 justify-start px-4 text-lg font-bold tracking-normal text-kw-text-primary ${isMacOS ? 'h-[88px] items-end pb-3' : 'h-14 items-center'}`}
      >
        {t('brand')}
      </div>
      <div className="px-3 py-3">
        <Button
          className="no-drag w-full"
          onClick={() => projectId && createThread.mutate(projectId)}
          disabled={!projectId}
        >
          <MessageSquarePlus size={16} /> {t('newThread')}
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 pb-2 text-xs font-medium text-kw-text-muted">
        <span>{t('projects')}</span>
        <IconButton label={t('addProject')} onClick={() => addProject.mutate()}>
          <Plus size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.length === 0 ? (
          <Button
            variant="secondary"
            onClick={() => addProject.mutate()}
            className="mt-3 h-auto w-full flex-col border-dashed py-8"
          >
            <FolderPlus size={22} /> {t('noProject')}
          </Button>
        ) : (
          projects.map((project, index) => {
            const selected = project.id === projectId
            const expanded = expandedProjectIds.has(project.id)
            const projectThreads = threadQueries[index]?.data ?? EMPTY_THREADS
            const disclosureId = `project-threads-${project.id}`
            return (
              <Disclosure.Root
                key={project.id}
                open={expanded}
                onOpenChange={(open) => {
                  setExpandedProjectIds((current) => {
                    const next = new Set(current)
                    if (open) next.add(project.id)
                    else next.delete(project.id)
                    return next
                  })
                }}
              >
                <div className="mb-1">
                  <Disclosure.Trigger asChild>
                    <SelectableItem asChild>
                      <button
                        type="button"
                        className={`flex h-[34px] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium ${selected ? 'text-kw-text-primary' : 'text-kw-text-secondary'}`}
                      >
                        <Folder
                          size={15}
                          className={selected ? 'text-kw-text-secondary' : 'text-kw-text-faint'}
                        />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        <Disclosure.Chevron open={expanded} direction="right" asChild>
                          <ChevronRight size={14} className="shrink-0 text-kw-text-faint" />
                        </Disclosure.Chevron>
                      </button>
                    </SelectableItem>
                  </Disclosure.Trigger>
                  <Disclosure.Content id={disclosureId}>
                    <div className="pb-1 pt-1">
                      <ProjectThreadList
                        threads={projectThreads}
                        selectedThreadId={threadId}
                        runningThreadIds={runningThreadIds}
                        onSelect={(targetThreadId) => {
                          if (!selected) setProject(project.id)
                          setThread(targetThreadId)
                        }}
                        onRename={(targetThreadId, title) =>
                          renameThread.mutate({ threadId: targetThreadId, title })
                        }
                        onArchive={(targetThreadId) => archiveThread.mutate(targetThreadId)}
                      />
                    </div>
                  </Disclosure.Content>
                </div>
              </Disclosure.Root>
            )
          })
        )}
      </div>
      <div className="flex h-12 items-center justify-between border-t border-kw-border-default px-3">
        <IconButton label={t('archive')}>
          <Archive size={16} />
        </IconButton>
        <SettingsDialog
          providers={bootstrap.providers}
          profiles={bootstrap.modelProfiles}
          settings={bootstrap.settings}
        />
      </div>
    </aside>
  )
}
