import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectableItem } from '@kowork/design-system'

export function ChangesPanel({ projectId }: { projectId?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<string>()
  const changesQuery = useQuery({
    queryKey: ['changes', projectId],
    queryFn: () => window.kowork.git.status(projectId!),
    enabled: Boolean(projectId)
  })
  const diffQuery = useQuery({
    queryKey: ['diff', projectId, selectedPath],
    queryFn: () => window.kowork.git.diff(projectId!, selectedPath!),
    enabled: Boolean(projectId && selectedPath)
  })

  if (selectedPath) {
    return (
      <div>
        <button type="button" className="kw-focus-ring m-3 flex items-center gap-1 text-xs text-kw-text-muted hover:text-kw-text-primary" onClick={() => setSelectedPath(undefined)}>
          <ArrowLeft size={13} />{t('back')}
        </button>
        <pre className="overflow-auto whitespace-pre p-4 pt-1 font-mono text-[11px] leading-5 text-kw-text-secondary">{diffQuery.data?.diff ?? ''}</pre>
      </div>
    )
  }

  return (
    <div className="p-2">
      {(changesQuery.data ?? []).length === 0 ? (
        <div className="p-8 text-center text-xs text-kw-text-faint">{t('noChanges')}</div>
      ) : (
        changesQuery.data?.map((change) => (
          <SelectableItem key={change.path} asChild>
            <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs" onClick={() => setSelectedPath(change.path)}>
              <span className="truncate text-kw-text-secondary">{change.path}</span>
              <span className="font-mono text-kw-warning">{change.indexStatus}{change.worktreeStatus}</span>
            </button>
          </SelectableItem>
        ))
      )}
    </div>
  )
}
