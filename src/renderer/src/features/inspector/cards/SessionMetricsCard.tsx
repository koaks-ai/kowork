import { useTranslation } from 'react-i18next'
import { Surface } from '@kowork/design-system'
import { formatTokenCount } from '../format'
import type { InspectorCardProps } from '../types'

export function SessionMetricsCard({ context }: InspectorCardProps): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <Surface asChild variant="card">
      <section className="p-4 shadow-kw-card">
        <h2 className="text-sm font-semibold text-kw-text-primary">{t('sessionMetrics')}</h2>
        <dl className="relative mt-4 grid grid-cols-2 gap-x-6 gap-y-6 text-xs">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-kw-border-subtle"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-kw-border-subtle"
          />
          <div className="relative">
            <dt className="text-kw-text-muted">{t('requests')}</dt>
            <dd className="mt-1 text-lg font-semibold text-kw-text-primary">
              {context.session.requestCount}
            </dd>
          </div>
          <div className="relative">
            <dt className="text-kw-text-muted">{t('tokenUsage')}</dt>
            <dd className="mt-1 text-lg font-semibold text-kw-text-primary">
              {formatTokenCount(context.session.totalTokens)}
            </dd>
          </div>
          <div className="relative">
            <dt className="text-kw-text-muted">{t('model')}</dt>
            <dd className="mt-1 font-medium text-kw-text-primary">{context.session.modelName}</dd>
          </div>
          <div className="relative">
            <dt className="text-kw-text-muted">{t('mode')}</dt>
            <dd className="mt-1 font-medium capitalize text-kw-text-primary">
              {context.session.permissionMode}
            </dd>
          </div>
        </dl>
      </section>
    </Surface>
  )
}
