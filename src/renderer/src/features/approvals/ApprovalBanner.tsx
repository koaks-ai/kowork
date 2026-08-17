import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ApprovalDto } from '@kowork/contracts'
import { BlurReveal } from '../../shared/ui/BlurReveal'

const BLUR_REVEAL_EXIT_MS = 220

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
    if (!retained) return undefined
    const timer = window.setTimeout(() => setRetained(undefined), BLUR_REVEAL_EXIT_MS)
    return () => window.clearTimeout(timer)
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
    <BlurReveal
      state={leaving ? 'closed' : 'open'}
      contentKey={current.id}
      className="pointer-events-auto mb-3 w-full"
    >
      <section
        aria-labelledby={promptId}
        className={`w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm ${interactive ? '' : 'pointer-events-none'}`}
      >
        <div className="flex items-start gap-3 px-3.5 pt-3.5">
          <div className="grid size-7 shrink-0 place-items-center rounded-md bg-neutral-100 text-neutral-600">
            <ShieldQuestion size={16} />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id={promptId} className="text-sm font-medium text-neutral-900">
              {approvalPrompt(current, t)}
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">{current.title}</p>
          </div>
        </div>

        <div className="mx-3.5 mt-3 max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50">
          <pre className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-xs leading-5 text-neutral-800 [overflow-wrap:anywhere]">
            {current.detail}
          </pre>
        </div>

        {respond.isError && (
          <p className="mx-3.5 mt-2 text-xs text-red-600">{t('approvalResponseFailed')}</p>
        )}

        <div className="flex items-center justify-end gap-2 px-3.5 py-3">
          <button
            type="button"
            disabled={respond.isPending || !interactive}
            className="h-8 rounded-md border border-neutral-300 bg-white px-3.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50"
            onClick={() => respond.mutate('deny')}
          >
            <span className="inline-flex items-center gap-1.5">
              {respond.isPending && respond.variables === 'deny' && (
                <LoaderCircle size={12} className="animate-spin" />
              )}
              {t('deny')}
            </span>
          </button>
          <button
            type="button"
            disabled={respond.isPending || !interactive}
            className="h-8 rounded-md bg-blue-600 px-3.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            onClick={() => respond.mutate('allow')}
          >
            <span className="inline-flex items-center gap-1.5">
              {respond.isPending && respond.variables === 'allow' && (
                <LoaderCircle size={12} className="animate-spin" />
              )}
              {t('allow')}
            </span>
          </button>
        </div>
      </section>
    </BlurReveal>
  )
}
