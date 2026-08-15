import { BrowserWindow, Notification } from 'electron'
import type { RunEventDto } from '@kowork/contracts'

export function notifyApprovalIfUnattended(
  event: RunEventDto,
  ensureWindow: () => BrowserWindow
): void {
  if (event.type !== 'approval.requested' || BrowserWindow.getAllWindows().length > 0) return
  const approval = event.payload.approval as { title?: string; detail?: string } | undefined
  const notification = new Notification({
    title: approval?.title ?? 'KoWork 等待审批',
    body: approval?.detail?.slice(0, 180) ?? '有一个后台任务需要你的确认'
  })
  notification.on('click', () => ensureWindow().show())
  notification.show()
}
