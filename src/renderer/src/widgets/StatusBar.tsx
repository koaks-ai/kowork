import { Folder, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppBootstrapDto } from '@kowork/contracts'
import { useWorkbenchStore } from '../shared/store/workbench'

export function StatusBar({ bootstrap }: { bootstrap: AppBootstrapDto }): React.JSX.Element {
  const { t } = useTranslation()
  const { projectId, threadId } = useWorkbenchStore()
  const project = bootstrap.projects.find((item) => item.id === projectId)
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-kw-border-default bg-kw-surface px-3 text-[10px] text-kw-text-muted">
      <div className="flex min-w-0 items-center gap-4">
        <span className="flex items-center gap-1 text-kw-success">
          <Wifi size={11} />
          {t('statusReady')}
        </span>
        {project && (
          <span className="flex min-w-0 items-center gap-1">
            <Folder size={11} />
            <span className="truncate">{project.rootPath}</span>
          </span>
        )}
      </div>
      {threadId && <span className="font-mono text-kw-text-faint">{threadId.slice(0, 18)}</span>}
    </footer>
  )
}
