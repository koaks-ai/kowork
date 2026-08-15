import type { PermissionMode } from '@kowork/contracts'

const readOnlyCommand =
  /^(pwd|ls|find|rg|grep|sed|head|tail|wc|cat|git\s+(status|diff|log|show|branch)|pnpm\s+(list|why)|npm\s+(list|view)|node\s+--version)(\s|$)/

export function requiresShellApproval(mode: PermissionMode, command: string): boolean {
  if (mode === 'yolo') return false
  if (mode === 'ask') return true
  return !readOnlyCommand.test(command.trim())
}
