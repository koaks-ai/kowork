import { useTranslation } from 'react-i18next'
import { Surface } from '@kowork/design-system'
import { formatTokenCount } from '../format'
import type { InspectorCardProps } from '../types'

export function ContextWindowCard({ context }: InspectorCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Surface asChild variant="card">
      <section className="p-4 shadow-kw-card">
        <h2 className="text-sm font-semibold text-kw-text-primary">{t('contextWindow')}</h2>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="rounded-sm bg-kw-success-subtle-strong px-2 py-1 font-medium text-kw-success">
            {t('contextHealthy')}
          </span>
          <strong>
            {formatTokenCount(context.contextWindow.usedTokens)} /{' '}
            {formatTokenCount(context.contextWindow.limitTokens)}
          </strong>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-sm bg-kw-border-default">
          <div
            className="h-full bg-kw-accent"
            style={{ width: `${context.contextWindow.percentage}%` }}
          />
        </div>
        <div className="mt-2 text-right text-[11px] text-kw-text-faint">
          {context.contextWindow.percentage.toFixed(1)}%
        </div>
      </section>
    </Surface>
  )
}
