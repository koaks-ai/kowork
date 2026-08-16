import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ApprovalBanner({ threadId }: { threadId: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['approvals', threadId],
    queryFn: () => window.kowork.approvals.list(threadId, true)
  })
  const approval = query.data?.[0]
  const respond = useMutation({
    mutationFn: (decision: 'allow' | 'deny') =>
      window.kowork.approvals.respond(approval!.id, decision),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['approvals', threadId] })
  })
  if (!approval) return null
  return (
    <div className="pointer-events-auto mb-3 flex w-full items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <ShieldAlert size={19} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{approval.title}</div>
        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-amber-800">
          {approval.detail}
        </pre>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
          onClick={() => respond.mutate('deny')}
        >
          {t('deny')}
        </button>
        <button
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          onClick={() => respond.mutate('allow')}
        >
          {t('allow')}
        </button>
      </div>
    </div>
  )
}
