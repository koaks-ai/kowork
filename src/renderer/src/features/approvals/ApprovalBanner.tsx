import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApprovalDto } from '@kowork/contracts'
import { Button, Reveal, Surface } from '@kowork/design-system'

function approvalPrompt(approval: ApprovalDto, t: ReturnType<typeof useTranslation>['t']): string {
  if (approval.kind === 'shell') return t('approvalShellPrompt')
  if (approval.kind === 'file_write') return t('approvalFileWritePrompt')
  if (approval.requestedAccess === 'read') return t('approvalExternalPathReadPrompt')
  if (approval.requestedAccess === 'write') return t('approvalExternalPathWritePrompt')
  return t('approvalExternalPathPrompt')
}

export function ApprovalBanner({ threadId }: { threadId: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['approvals', threadId],
    queryFn: () => window.kowork.approvals.list(threadId, true)
  })
  const approval = query.data?.[0]

  const [retained, setRetained] = useState<ApprovalDto | undefined>(approval)

  useEffect(() => {
    if (approval) {
      const timer = window.setTimeout(() => setRetained(approval), 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [approval, retained])

  const current = approval ?? retained
  const leaving = !approval && retained !== undefined

  const respond = useMutation({
    mutationFn: (decision: 'allow' | 'deny') =>
      window.kowork.approvals.respond(current!.id, decision),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['approvals', threadId] })
  })

  if (!current) return null
  const promptId = `approval-${current.id}-prompt`
  const interactive = !leaving

  return (
    <Reveal
      state={leaving ? 'closed' : 'open'}
      contentKey={current.id}
      className="pointer-events-auto mb-3 w-full"
      onExitComplete={() => setRetained(undefined)}
    >
      <Surface
        asChild
        variant="card"
      >
      <section
        aria-labelledby={promptId}
        className={`w-full overflow-hidden rounded-xl shadow-sm ${interactive ? '' : 'pointer-events-none'}`}
      >
        <div className="flex items-start gap-3 px-3.5 pt-3.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-kw-surface-subtle text-kw-text-secondary">
            <ShieldQuestion size={16} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id={promptId} className="text-sm font-medium text-kw-text-primary">
              {approvalPrompt(current, t)}
            </h2>
            <p className="mt-0.5 text-xs text-kw-text-muted">{current.title}</p>
          </div>
        </div>

        <div className="mx-3.5 mt-3 max-h-40 overflow-y-auto rounded-md border border-kw-border-default bg-kw-surface-subtle">
          <pre className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-xs leading-5 text-kw-text-secondary [overflow-wrap:anywhere]">
            {current.detail}
          </pre>
        </div>

        {respond.isError && (
          <p className="mx-3.5 mt-2 text-xs text-kw-danger">{t('approvalResponseFailed')}</p>
        )}

        <div className="flex items-center justify-end gap-2 px-3.5 py-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={respond.isPending || !interactive}
            onClick={() => respond.mutate('deny')}
          >
            <span className="inline-flex items-center gap-1.5">
              {respond.isPending && respond.variables === 'deny' && (
                <LoaderCircle size={12} className="kw-spinner" />
              )}
              {t('deny')}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={respond.isPending || !interactive}
            onClick={() => respond.mutate('allow')}
          >
            <span className="inline-flex items-center gap-1.5">
              {respond.isPending && respond.variables === 'allow' && (
                <LoaderCircle size={12} className="kw-spinner" />
              )}
              {t('allow')}
            </span>
          </Button>
        </div>
      </section>
      </Surface>
    </Reveal>
  )
}
