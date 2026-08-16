import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  FileDiff,
  GitBranch,
  GitCompareArrows,
  Laptop,
  Plus,
  X
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppBootstrapDto } from '@kowork/contracts'
import { useWorkbenchStore } from '../shared/store/workbench'

type InspectorTab = 'overview' | 'changes'

const INSPECTOR_TABS: InspectorTab[] = ['overview', 'changes']

function formatTokens(tokens: number): string {
  return `${(tokens / 1_000).toFixed(2).replace(/\.00$/, '')}K`
}

export function InspectorPanel({ bootstrap }: { bootstrap: AppBootstrapDto }): React.JSX.Element {
  const { t } = useTranslation()
  const store = useWorkbenchStore()
  const [tabs, setTabs] = useState<InspectorTab[]>(['overview'])
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview')
  const [changeSelection, setChangeSelection] = useState<{
    projectId: string
    path: string
  }>()
  const selectedChange =
    changeSelection && changeSelection.projectId === store.projectId
      ? changeSelection.path
      : undefined
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
  const gitSummaryQuery = useQuery({
    queryKey: ['git-summary', store.projectId],
    queryFn: () => window.kowork.git.summary(store.projectId!),
    enabled: Boolean(store.projectId),
    refetchInterval: 3_000
  })
  const changesQuery = useQuery({
    queryKey: ['changes', store.projectId],
    queryFn: () => window.kowork.git.status(store.projectId!),
    enabled: Boolean(store.projectId && tabs.includes('changes'))
  })
  const diffQuery = useQuery({
    queryKey: ['diff', store.projectId, selectedChange],
    queryFn: () => window.kowork.git.diff(store.projectId!, selectedChange!),
    enabled: Boolean(store.projectId && selectedChange)
  })
  const runs = runsQuery.data ?? []
  const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0)
  const latestPrompt = runs.at(-1)?.promptTokens ?? 0
  const profile = bootstrap.modelProfiles.find((item) => item.id === thread?.modelProfileId)
  const limit = thread?.contextWindowTokens ?? profile?.contextWindowTokens ?? 1
  const percentage = Math.min((latestPrompt / limit) * 100, 100)

  const openChangesTab = (): void => {
    setTabs((current) => (current.includes('changes') ? current : [...current, 'changes']))
    setActiveTab('changes')
  }

  const closeChangesTab = (): void => {
    setTabs((current) => current.filter((tab) => tab !== 'changes'))
    setActiveTab('overview')
    setChangeSelection(undefined)
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-neutral-200 bg-white">
      <header className="app-drag flex h-14 shrink-0 items-center gap-1.5 border-b border-neutral-200 px-2.5">
        <div role="tablist" className="flex min-w-0 flex-1 items-center">
          {INSPECTOR_TABS.map((tab) => {
            const active = tab === activeTab
            const visible = tab === 'overview' || tabs.includes(tab)
            const Icon = tab === 'overview' ? BarChart3 : GitCompareArrows
            return (
              <div
                key={tab}
                aria-hidden={!visible}
                className={`no-drag flex h-8 min-w-0 max-w-[168px] flex-none items-center overflow-hidden rounded-xl transition-[width,margin,opacity,transform,background-color,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  active
                    ? 'bg-neutral-200/60 text-neutral-900'
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800'
                } ${
                  tab === 'changes'
                    ? visible
                      ? 'ml-1.5 translate-x-0 opacity-100'
                      : 'pointer-events-none ml-0 translate-x-2 opacity-0'
                    : ''
                }`}
                style={{
                  width:
                    tab === 'overview'
                      ? tabs.includes('changes')
                        ? 'calc((100% - 0.375rem) / 2)'
                        : '168px'
                      : visible
                        ? 'calc((100% - 0.375rem) / 2)'
                        : '0px'
                }}
              >
                <button
                  type="button"
                  role="tab"
                  id={`inspector-tab-${tab}`}
                  aria-controls={`inspector-panel-${tab}`}
                  aria-selected={active}
                  tabIndex={visible ? 0 : -1}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-medium"
                  onClick={() => setActiveTab(tab)}
                >
                  <Icon size={16} className="shrink-0 text-neutral-600" />
                  <span className="truncate">{t(tab)}</span>
                </button>
                {tab === 'changes' && (
                  <button
                    type="button"
                    aria-label={t('close')}
                    tabIndex={visible ? 0 : -1}
                    className="mr-1 grid size-7 shrink-0 place-items-center rounded-md text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                    onClick={closeChangesTab}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          aria-label={t('addInspectorTab')}
          disabled
          className="no-drag grid size-9 shrink-0 place-items-center rounded-md text-neutral-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Plus size={18} />
        </button>
      </header>

      {activeTab === 'overview' ? (
        <div
          id="inspector-panel-overview"
          role="tabpanel"
          aria-labelledby="inspector-tab-overview"
          className="min-h-0 flex-1 overflow-y-auto p-4"
        >
          <section data-status-information className="rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">{t('statusInformation')}</h2>
            <ul className="mt-4 space-y-3.5 text-sm text-neutral-800">
              <li className="-mx-2">
                <button
                  type="button"
                  className="relative isolate flex min-h-7 w-full items-center gap-3 px-2 text-left before:pointer-events-none before:absolute before:-inset-y-1 before:inset-x-0 before:-z-10 before:rounded-xl before:bg-transparent before:transition-colors hover:before:bg-neutral-50"
                  onClick={openChangesTab}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FileDiff size={16} className="shrink-0 text-neutral-500" />
                    {t('codeChanges')}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 font-medium tabular-nums">
                    <span className="text-emerald-600">
                      +{(gitSummaryQuery.data?.additions ?? 0).toLocaleString()}
                    </span>
                    <span className="text-red-500">
                      -{(gitSummaryQuery.data?.deletions ?? 0).toLocaleString()}
                    </span>
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-neutral-400" />
                </button>
              </li>
              <li className="flex min-h-5 items-center gap-2.5">
                <Laptop size={16} className="shrink-0 text-neutral-500" />
                <span>{t('local')}</span>
              </li>
              <li className="flex min-h-5 items-center gap-2.5">
                <GitBranch size={16} className="shrink-0 text-neutral-500" />
                <span className="min-w-0 truncate">{gitSummaryQuery.data?.branch ?? '-'}</span>
              </li>
            </ul>
          </section>
          <section className="mt-4 rounded-lg border border-neutral-200 p-4">
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
        </div>
      ) : (
        <div
          id="inspector-panel-changes"
          role="tabpanel"
          aria-labelledby="inspector-tab-changes"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {selectedChange ? (
            <div>
              <button
                type="button"
                className="m-3 flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                onClick={() => setChangeSelection(undefined)}
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
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-neutral-100"
                    onClick={() =>
                      setChangeSelection({ projectId: store.projectId!, path: change.path })
                    }
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
        </div>
      )}
    </aside>
  )
}
