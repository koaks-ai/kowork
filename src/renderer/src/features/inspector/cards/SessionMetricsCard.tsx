import { useTranslation } from 'react-i18next'
import { Surface } from '@kowork/design-system'
import type { InspectorCardProps } from '../types'

function formatTokens(tokens: number): string {
  return `${(tokens / 1_000).toFixed(2).replace(/\.00$/, '')}K`
}

export function SessionMetricsCard({ context }: InspectorCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Surface asChild variant="card">
      <section className="p-4">
        <h2 className="text-sm font-semibold text-kw-text-primary">{t('sessionMetrics')}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 text-xs">
          <div><dt className="text-kw-text-muted">{t('requests')}</dt><dd className="mt-1 text-lg font-semibold text-kw-text-primary">{context.session.requestCount}</dd></div>
          <div><dt className="text-kw-text-muted">{t('tokenUsage')}</dt><dd className="mt-1 text-lg font-semibold text-kw-text-primary">{formatTokens(context.session.totalTokens)}</dd></div>
          <div><dt className="text-kw-text-muted">{t('model')}</dt><dd className="mt-1 font-medium text-kw-text-primary">{context.session.modelName}</dd></div>
          <div><dt className="text-kw-text-muted">{t('mode')}</dt><dd className="mt-1 font-medium capitalize text-kw-text-primary">{context.session.permissionMode}</dd></div>
        </dl>
      </section>
    </Surface>
  )
}
