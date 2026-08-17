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
import { SettingsDialog } from '../features/settings/SettingsDialog'
import { useWorkbenchStore } from '../shared/store/workbench'
import { AnimatedDisclosure } from '../shared/ui/AnimatedDisclosure'
import { BlurSwapText } from '../shared/ui/BlurSwapText'
import { ContextMenu } from '../shared/ui/ContextMenu'
import { IconButton } from '../shared/ui/IconButton'
import { InlineRenameInput } from '../shared/ui/InlineRenameInput'
import { OrbitSquares } from '../shared/ui/OrbitSquares'
import { SelectionList } from '../shared/ui/SelectionList'

interface ProjectSidebarProps {
  bootstrap: AppBootstrapDto
  isMacOS: boolean
  frosted?: boolean
}

const EMPTY_THREADS: ThreadDto[] = []
const SIDEBAR_ROW_HEIGHT = 34
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
  const selectedIndex = threads.findIndex((thread) => thread.id === selectedThreadId)
  const [highlightedIndex, setHighlightedIndex] = useState(Math.max(selectedIndex, 0))
  const [previousSelectedIndex, setPreviousSelectedIndex] = useState(selectedIndex)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ threadId: string; x: number; y: number } | null>(null)

  if (selectedIndex !== previousSelectedIndex) {
    setPreviousSelectedIndex(selectedIndex)
    if (selectedIndex >= 0) setHighlightedIndex(selectedIndex)
  }

  const menuThread = menu ? threads.find((thread) => thread.id === menu.threadId) : undefined

  return (
    <SelectionList
      index={highlightedIndex}
      visible={selectedIndex >= 0}
      itemHeight={SIDEBAR_ROW_HEIGHT}
      radius="lg"
    >
      {threads.map((thread) => (
        <div
          key={thread.id}
          data-selected={thread.id === selectedThreadId || undefined}
          className={`kowork-select-item flex h-[34px] w-full items-center rounded-lg px-2 ${thread.id === selectedThreadId ? 'text-neutral-900' : 'text-neutral-700'}`}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setRenamingId(null)
            setMenu({ threadId: thread.id, x: event.clientX, y: event.clientY })
          }}
        >
          {renamingId === thread.id ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ThreadRunningMark running={runningThreadIds.has(thread.id)} />
              <InlineRenameInput
                value={thread.title}
                placeholder={t('untitledThread')}
                aria-label={t('threadTitle')}
                className="mx-0.5 h-[26px] min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 text-sm text-neutral-900 outline-none"
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
              <BlurSwapText
                className="min-w-0 flex-1"
                value={thread.title}
                fallback={t('untitledThread')}
              />
            </button>
          )}
        </div>
      ))}
      {menu && menuThread ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              id: 'rename',
              label: t('renameThread'),
              icon: <Pencil size={14} />,
              onSelect: () => setRenamingId(menuThread.id)
            },
            {
              id: 'delete',
              label: t('deleteThread'),
              icon: <Trash2 size={14} />,
              destructive: true,
              separatorBefore: true,
              onSelect: () => onArchive(menuThread.id)
            }
          ]}
        />
      ) : null}
    </SelectionList>
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
      className="group/sidebar flex h-full w-full flex-col border-r border-neutral-200 bg-white data-[frosted]:border-black/10 data-[frosted]:bg-white/65"
    >
      <div
        className={`app-brand app-drag flex shrink-0 justify-start px-4 text-lg font-bold tracking-normal text-neutral-900 ${isMacOS ? 'h-[88px] items-end pb-3' : 'h-14 items-center'}`}
      >
        {t('brand')}
      </div>
      <div className="px-3 py-3">
        <button
          className="kowork-hover-fill no-drag flex h-9 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-250 hover:text-neutral-900 disabled:opacity-50"
          onClick={() => projectId && createThread.mutate(projectId)}
          disabled={!projectId}
        >
          <MessageSquarePlus size={16} /> {t('newThread')}
        </button>
      </div>
      <div className="flex items-center justify-between px-4 pb-2 text-xs font-medium text-neutral-500">
        <span>{t('projects')}</span>
        <IconButton label={t('addProject')} onClick={() => addProject.mutate()}>
          <Plus size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.length === 0 ? (
          <button
            onClick={() => addProject.mutate()}
            className="mt-3 flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-neutral-300 px-4 py-8 text-xs text-neutral-500 hover:border-blue-500 hover:text-blue-700"
          >
            <FolderPlus size={22} /> {t('noProject')}
          </button>
        ) : (
          projects.map((project, index) => {
            const selected = project.id === projectId
            const expanded = expandedProjectIds.has(project.id)
            const projectThreads = threadQueries[index]?.data ?? EMPTY_THREADS
            const disclosureId = `project-threads-${project.id}`
            return (
              <div key={project.id} className="mb-1">
                <button
                  type="button"
                  aria-controls={disclosureId}
                  aria-expanded={expanded}
                  className={`kowork-select-item flex h-[34px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium ${selected ? 'text-neutral-900' : 'text-neutral-700'}`}
                  onClick={() => {
                    setExpandedProjectIds((current) => {
                      const next = new Set(current)
                      if (next.has(project.id)) next.delete(project.id)
                      else next.add(project.id)
                      return next
                    })
                  }}
                >
                  <Folder
                    size={15}
                    className={selected ? 'text-neutral-600' : 'text-neutral-400'}
                  />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-neutral-400 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
                  />
                </button>
                <AnimatedDisclosure open={expanded} id={disclosureId}>
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
                </AnimatedDisclosure>
              </div>
            )
          })
        )}
      </div>
      <div className="flex h-12 items-center justify-between border-t border-neutral-200 px-3 group-data-[frosted]/sidebar:border-black/10">
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
