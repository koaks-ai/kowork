import { useQuery } from '@tanstack/react-query'
import { BarChart3, GitCompareArrows, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppBootstrapDto } from '@kowork/contracts'
import { IconButton, Reveal, SelectableItem, SelectableList } from '@kowork/design-system'
import { useWorkbenchStore } from '../../shared/store/workbench'
import { inspectorCardRegistry } from './builtins'
import { ChangesPanel } from './ChangesPanel'
import { useInspectorCards } from './registry'
import type { InspectorCardContext } from './types'

type InspectorTab = 'overview' | 'changes'

export function InspectorPanel({ bootstrap }: { bootstrap: AppBootstrapDto }): React.JSX.Element {
  const { t } = useTranslation()
  const store = useWorkbenchStore()
  const cards = useInspectorCards(inspectorCardRegistry)
  const [tabs, setTabs] = useState<InspectorTab[]>(['overview'])
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview')
  const threadsQuery = useQuery({ queryKey: ['threads', store.projectId], queryFn: () => window.kowork.threads.list(store.projectId!), enabled: Boolean(store.projectId) })
  const thread = threadsQuery.data?.find((item) => item.id === store.threadId)
  const runsQuery = useQuery({ queryKey: ['runs', store.threadId], queryFn: () => window.kowork.runs.list(store.threadId!), enabled: Boolean(store.threadId) })
  const gitSummaryQuery = useQuery({ queryKey: ['git-summary', store.projectId], queryFn: () => window.kowork.git.summary(store.projectId!), enabled: Boolean(store.projectId), refetchInterval: 3_000 })
  const runs = runsQuery.data ?? []
  const profile = bootstrap.modelProfiles.find((item) => item.id === thread?.modelProfileId)
  const latestPrompt = runs.at(-1)?.promptTokens ?? 0
  const limit = thread?.contextWindowTokens ?? profile?.contextWindowTokens ?? 1
  const percentage = Math.min((latestPrompt / limit) * 100, 100)

  const openChanges = (): void => {
    setTabs((current) => current.includes('changes') ? current : [...current, 'changes'])
    setActiveTab('changes')
  }
  const closeChanges = (): void => {
    setTabs((current) => current.filter((tab) => tab !== 'changes'))
    setActiveTab('overview')
  }

  const context: InspectorCardContext = {
    projectId: store.projectId,
    threadId: store.threadId,
    status: { additions: gitSummaryQuery.data?.additions ?? 0, deletions: gitSummaryQuery.data?.deletions ?? 0, branch: gitSummaryQuery.data?.branch ?? '-' },
    contextWindow: { usedTokens: latestPrompt, limitTokens: limit, percentage },
    session: { requestCount: runs.length, totalTokens: runs.reduce((sum, run) => sum + run.totalTokens, 0), modelName: profile?.name ?? '-', permissionMode: thread?.permissionMode ?? '-' },
    actions: { openChanges }
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-kw-border-default bg-kw-surface">
      <header className="app-drag flex h-12 shrink-0 items-center gap-1.5 border-b border-kw-border-default px-2.5">
        <SelectableList role="tablist" value={activeTab} orientation="horizontal" selectionStyle="sliding" className="flex min-w-0 flex-1 items-center gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab === 'overview' ? BarChart3 : GitCompareArrows
            return (
              <SelectableItem key={tab} value={tab} asChild>
                <div className="no-drag flex h-8 min-w-0 max-w-[168px] flex-1 items-center rounded-lg text-kw-text-muted">
                  <button type="button" role="tab" id={`inspector-tab-${tab}`} aria-controls={`inspector-panel-${tab}`} aria-selected={activeTab === tab} className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-medium" onClick={() => setActiveTab(tab)}>
                    <Icon size={16} className="shrink-0 text-kw-text-secondary" /><span className="truncate">{t(tab)}</span>
                  </button>
                  {tab === 'changes' ? <IconButton label={t('close')} onClick={closeChanges}><X size={14} /></IconButton> : null}
                </div>
              </SelectableItem>
            )
          })}
        </SelectableList>
        <IconButton label={t('addInspectorTab')} disabled><Plus size={18} /></IconButton>
      </header>

      {activeTab === 'overview' ? (
        <Reveal contentKey="overview" id="inspector-panel-overview" role="tabpanel" aria-labelledby="inspector-tab-overview" className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {cards.map((definition) => <definition.component key={definition.id} context={context} />)}
          </div>
        </Reveal>
      ) : (
        <Reveal contentKey="changes" id="inspector-panel-changes" role="tabpanel" aria-labelledby="inspector-tab-changes" className="min-h-0 flex-1 overflow-y-auto">
          <ChangesPanel projectId={store.projectId} />
        </Reveal>
      )}
    </aside>
  )
}
