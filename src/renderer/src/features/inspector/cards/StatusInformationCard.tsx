import { ChevronRight, FileDiff, GitBranch, Laptop } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SelectableItem, Surface } from '@kowork/design-system'
import type { InspectorCardProps } from '../types'

export function StatusInformationCard({ context }: InspectorCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Surface asChild variant="card">
      <section data-status-information className="p-4">
        <h2 className="text-sm font-semibold text-kw-text-primary">{t('statusInformation')}</h2>
        <ul className="mt-4 space-y-3.5 text-sm text-kw-text-secondary">
          <li className="-mx-2">
            <SelectableItem asChild>
              <button type="button" className="flex min-h-7 w-full items-center gap-3 rounded-md px-2 text-left" onClick={context.actions.openChanges}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <FileDiff size={16} className="shrink-0 text-kw-text-muted" />
                  {t('codeChanges')}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-medium tabular-nums">
                  <span className="text-kw-success">+{context.status.additions.toLocaleString()}</span>
                  <span className="text-kw-danger">-{context.status.deletions.toLocaleString()}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-kw-text-faint" />
              </button>
            </SelectableItem>
          </li>
          <li className="flex min-h-5 items-center gap-2.5">
            <Laptop size={16} className="shrink-0 text-kw-text-muted" />
            <span>{t('local')}</span>
          </li>
          <li className="flex min-h-5 items-center gap-2.5">
            <GitBranch size={16} className="shrink-0 text-kw-text-muted" />
            <span className="min-w-0 truncate">{context.status.branch}</span>
          </li>
        </ul>
      </section>
    </Surface>
  )
}
