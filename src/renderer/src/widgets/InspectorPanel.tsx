import * as Tabs from '@radix-ui/react-tabs'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, FileCode2, FileText, Folder, GitCompareArrows } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppBootstrapDto } from '@kowork/contracts'
import { useWorkbenchStore } from '../shared/store/workbench'
import { IconButton } from '../shared/ui/IconButton'

function formatTokens(tokens: number): string {
  return `${(tokens / 1_000).toFixed(2).replace(/\.00$/, '')}K`
}

export function InspectorPanel({ bootstrap }: { bootstrap: AppBootstrapDto }): React.JSX.Element {
  const { t } = useTranslation()
  const store = useWorkbenchStore()
  const threadsQuery = useQuery({
    queryKey: ['threads', store.projectId],
    queryFn: () => window.kowork.threads.list(store.projectId!),
    enabled: Boolean(store.projectId)
  })
  const thread = threadsQuery.data?.find((item) => item.id === store.threadId)
  const runsQuery = useQuery({
    queryKey: ['runs', store.threadId],
    queryFn: () => window.kowork.runs.list(store.threadId!),
    enabled: Boolean(store.threadId)
  })
  const filesQuery = useQuery({
    queryKey: ['files', store.projectId, store.fileDirectory],
    queryFn: () => window.kowork.files.list(store.projectId!, store.fileDirectory),
    enabled: Boolean(store.projectId)
  })
  const fileQuery = useQuery({
    queryKey: ['file', store.projectId, store.selectedFile],
    queryFn: () => window.kowork.files.read(store.projectId!, store.selectedFile!),
    enabled: Boolean(store.projectId && store.selectedFile)
  })
  const changesQuery = useQuery({
    queryKey: ['changes', store.projectId],
    queryFn: () => window.kowork.git.status(store.projectId!),
    enabled: Boolean(store.projectId)
  })
  const diffQuery = useQuery({
    queryKey: ['diff', store.projectId, store.selectedChange],
    queryFn: () => window.kowork.git.diff(store.projectId!, store.selectedChange),
    enabled: Boolean(store.projectId && store.selectedChange)
  })
  const runs = runsQuery.data ?? []
  const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0)
  const latestPrompt = runs.at(-1)?.promptTokens ?? 0
  const profile = bootstrap.modelProfiles.find((item) => item.id === thread?.modelProfileId)
  const limit = thread?.contextWindowTokens ?? profile?.contextWindowTokens ?? 1
  const percentage = Math.min((latestPrompt / limit) * 100, 100)

  return (
    <aside className="hidden h-full w-[332px] shrink-0 border-l border-neutral-200 bg-white xl:flex xl:flex-col">
      <Tabs.Root
        value={store.inspectorTab}
        onValueChange={(value) => store.setInspectorTab(value as 'overview' | 'files' | 'changes')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="app-drag flex h-14 shrink-0 items-end gap-5 border-b border-neutral-200 px-4">
          {[
            { value: 'overview', Icon: BarChart3, label: t('overview') },
            { value: 'files', Icon: FileText, label: t('files') },
            { value: 'changes', Icon: GitCompareArrows, label: t('changes') }
          ].map(({ value, Icon, label }) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="no-drag flex h-full items-center gap-1.5 border-b-2 border-transparent text-xs font-medium text-neutral-500 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700"
            >
              <Icon size={15} />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('contextWindow')}</h2>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                {t('contextHealthy')}
              </span>
              <strong>
                {formatTokens(latestPrompt)} / {formatTokens(limit)}
              </strong>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-neutral-200">
              <div
                className="h-full bg-blue-500 transition-[width]"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="mt-2 text-right text-[11px] text-neutral-400">
              {percentage.toFixed(1)}%
            </div>
          </section>
          <section className="mt-4 rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('sessionMetrics')}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 text-xs">
              <div>
                <dt className="text-neutral-500">{t('requests')}</dt>
                <dd className="mt-1 text-lg font-semibold text-neutral-900">{runs.length}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{t('tokenUsage')}</dt>
                <dd className="mt-1 text-lg font-semibold text-neutral-900">
                  {formatTokens(totalTokens)}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">{t('model')}</dt>
                <dd className="mt-1 font-medium text-neutral-900">{profile?.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{t('mode')}</dt>
                <dd className="mt-1 font-medium capitalize text-neutral-900">
                  {thread?.permissionMode ?? '-'}
                </dd>
              </div>
            </dl>
          </section>
        </Tabs.Content>
        <Tabs.Content value="files" className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex h-10 items-center gap-2 border-b border-neutral-100 px-3 text-xs text-neutral-500">
            {store.fileDirectory !== '.' && (
              <IconButton
                label={t('back')}
                onClick={() =>
                  store.setFileDirectory(
                    store.fileDirectory.split('/').slice(0, -1).join('/') || '.'
                  )
                }
              >
                <ArrowLeft size={14} />
              </IconButton>
            )}
            <Folder size={14} />
            <span className="truncate">{store.fileDirectory}</span>
          </div>
          {store.selectedFile ? (
            <pre className="min-h-full overflow-auto whitespace-pre p-4 font-mono text-xs leading-5 text-neutral-700">
              {fileQuery.data?.content ?? ''}
            </pre>
          ) : (
            <div className="p-2">
              {(filesQuery.data ?? []).map((entry) => (
                <button
                  key={entry.relativePath}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-100"
                  onClick={() =>
                    entry.kind === 'directory'
                      ? store.setFileDirectory(entry.relativePath)
                      : store.setSelectedFile(entry.relativePath)
                  }
                >
                  {entry.kind === 'directory' ? (
                    <Folder size={14} className="text-amber-600" />
                  ) : (
                    <FileCode2 size={14} className="text-neutral-400" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </Tabs.Content>
        <Tabs.Content value="changes" className="min-h-0 flex-1 overflow-y-auto">
          {store.selectedChange ? (
            <div>
              <button
                className="m-3 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                onClick={() => store.setSelectedChange(undefined)}
              >
                <ArrowLeft size={13} />
                {t('back')}
              </button>
              <pre className="overflow-auto whitespace-pre p-4 pt-1 font-mono text-[11px] leading-5 text-neutral-700">
                {diffQuery.data?.diff ?? ''}
              </pre>
            </div>
          ) : (
            <div className="p-2">
              {(changesQuery.data ?? []).length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-400">{t('noChanges')}</div>
              ) : (
                changesQuery.data?.map((change) => (
                  <button
                    key={change.path}
                    className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-neutral-100"
                    onClick={() => store.setSelectedChange(change.path)}
                  >
                    <span className="truncate text-neutral-700">{change.path}</span>
                    <span className="font-mono text-orange-600">
                      {change.indexStatus}
                      {change.worktreeStatus}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  )
}
