import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Folder,
  FolderPlus,
  MessageSquarePlus,
  Plus,
  Settings as SettingsIcon,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppBootstrapDto, ProjectDto, ThreadDto } from '@kowork/contracts'
import { SettingsDialog } from '../features/settings/SettingsDialog'
import { useWorkbenchStore } from '../shared/store/workbench'
import { BlurSwapText } from '../shared/ui/BlurSwapText'
import { IconButton } from '../shared/ui/IconButton'

interface ProjectSidebarProps {
  bootstrap: AppBootstrapDto
  isMacOS: boolean
}

export function ProjectSidebar({ bootstrap, isMacOS }: ProjectSidebarProps): React.JSX.Element {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { projectId, threadId, setProject, setThread } = useWorkbenchStore()
  const projects = bootstrap.projects
  const threadsQuery = useQuery({
    queryKey: ['threads', projectId],
    queryFn: () => window.kowork.threads.list(projectId!),
    enabled: Boolean(projectId)
  })
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])

  useEffect(() => {
    if (!projectId && projects[0]) setProject(projects[0].id)
  }, [projectId, projects, setProject])
  useEffect(() => {
    if (projectId && !threadId && threads[0]) setThread(threads[0].id)
  }, [projectId, threadId, threads, setThread])

  const addProject = useMutation({
    mutationFn: () => window.kowork.projects.add(),
    onSuccess: (project) => {
      if (!project) return
      queryClient.setQueryData<ProjectDto[]>(['projects'], (current = []) => [
        project,
        ...current.filter((item) => item.id !== project.id)
      ])
      void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
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
      setThread(thread.id)
    }
  })
  const archiveThread = useMutation({
    mutationFn: (targetThreadId: string) => window.kowork.threads.archive(targetThreadId),
    onSuccess: (thread) => {
      void queryClient.invalidateQueries({ queryKey: ['threads', thread.projectId] })
      if (threadId === thread.id) setThread(undefined)
    }
  })

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div
        className={`app-brand app-drag flex shrink-0 justify-start border-b border-neutral-100 px-4 text-lg font-bold tracking-normal text-neutral-900 ${isMacOS ? 'h-[88px] items-end pb-3' : 'h-14 items-center'}`}
      >
        <span className="mr-2.5 grid size-7 place-items-center rounded-md bg-blue-600 text-sm text-white">
          K
        </span>
        {t('brand')}
      </div>
      <div className="px-3 py-3">
        <button
          className="no-drag flex h-9 w-full items-center justify-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
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
          projects.map((project) => {
            const selected = project.id === projectId
            return (
              <div key={project.id} className="mb-1">
                <button
                  className={`group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm ${selected ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}`}
                  onClick={() => setProject(project.id)}
                >
                  <Folder size={15} className={selected ? 'text-blue-600' : 'text-neutral-400'} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </button>
                {selected && (
                  <div className="ml-4 mt-1 border-l border-neutral-200 pl-2">
                    {threads.map((thread) => (
                      <div
                        key={thread.id}
                        className={`group flex items-center rounded-md ${thread.id === threadId ? 'bg-blue-50 text-blue-900' : 'text-neutral-600 hover:bg-neutral-50'}`}
                      >
                        <button
                          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm"
                          onClick={() => setThread(thread.id)}
                        >
                          <BlurSwapText value={thread.title} fallback={t('untitledThread')} />
                        </button>
                        <button
                          className="mr-1 hidden p-1 text-neutral-400 hover:text-red-600 group-hover:block"
                          aria-label={t('archive')}
                          onClick={() => archiveThread.mutate(thread.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="mt-1 flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-500 hover:text-neutral-900"
                      onClick={() => createThread.mutate(project.id)}
                    >
                      <Plus size={13} />
                      {t('newThread')}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
      <div className="flex h-12 items-center justify-between border-t border-neutral-200 px-3">
        <IconButton label={t('archive')}>
          <Archive size={16} />
        </IconButton>
        <SettingsDialog
          providers={bootstrap.providers}
          profiles={bootstrap.modelProfiles}
          settings={bootstrap.settings}
        />
        <IconButton label={t('settings')} disabled>
          <SettingsIcon size={16} />
        </IconButton>
      </div>
    </aside>
  )
}
